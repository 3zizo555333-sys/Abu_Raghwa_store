begin;

-- Older production builds wrote clear-text PINs to pin_code while the current
-- verifier reads the bcrypt hash in withdrawal_pin_hash.
alter table public.staff_employees
  add column if not exists pin_code text,
  add column if not exists withdrawal_pin_hash text,
  add column if not exists withdrawal_pin_enabled boolean not null default true;

alter table public.staff_employees drop constraint if exists staff_employees_role_check;
alter table public.staff_employees
  add constraint staff_employees_role_check
  check (role in ('manager', 'supervisor', 'cashier', 'seller'));

alter table public.staff_withdrawals
  add column if not exists transaction_type text not null default 'withdrawal';

do $constraint$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'staff_withdrawals_transaction_type_check'
      and conrelid = 'public.staff_withdrawals'::regclass
  ) then
    alter table public.staff_withdrawals
      add constraint staff_withdrawals_transaction_type_check
      check (transaction_type in ('withdrawal', 'expense'));
  end if;
end;
$constraint$;

-- Backfill valid legacy PINs into the single bcrypt storage column, then erase
-- all clear-text values. Invalid legacy values require a manager to set a new PIN.
update public.staff_employees e
set withdrawal_pin_hash = extensions.crypt(
      translate(regexp_replace(e.pin_code, '[[:space:]]+', '', 'g'),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
      extensions.gen_salt('bf', 12)),
    withdrawal_pin_enabled = true,
    pin_code = null,
    updated_at = now()
where e.pin_code is not null
  and btrim(e.pin_code) <> ''
  and translate(regexp_replace(e.pin_code, '[[:space:]]+', '', 'g'),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789') ~ '^[0-9]{4}$';

update public.staff_employees
set pin_code = null, updated_at = now()
where pin_code is not null;

create or replace function public.admin_set_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pin text;
  v_shop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'EMPLOYEE_PIN_ADMIN_AUTH_REQUIRED' using errcode = '42501';
  end if;
  v_pin := translate(regexp_replace(coalesce(p_pin, ''), '[[:space:]]+', '', 'g'),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'EMPLOYEE_PIN_MUST_BE_4_DIGITS' using errcode = '22023';
  end if;
  select e.shop_id into v_shop_id
  from public.staff_employees e
  where e.id = p_employee_id and e.deleted_at is null;
  if v_shop_id is null or not public.has_shop_role(v_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.staff_employees e
    where e.shop_id = v_shop_id and e.id <> p_employee_id
      and e.deleted_at is null and e.withdrawal_pin_hash is not null
      and extensions.crypt(v_pin, e.withdrawal_pin_hash) = e.withdrawal_pin_hash
  ) then
    raise exception 'EMPLOYEE_PIN_ALREADY_ASSIGNED' using errcode = '22023';
  end if;
  update public.staff_employees e
  set withdrawal_pin_hash = extensions.crypt(v_pin, extensions.gen_salt('bf', 12)),
      withdrawal_pin_enabled = true,
      pin_code = null,
      updated_at = now()
  where e.id = p_employee_id and e.shop_id = v_shop_id and e.deleted_at is null;

  -- PIN changes clear lockouts for the shop and revoke only the changed
  -- employee's already-verified sessions.
  update public.staff_employee_pin_attempts a
  set failed_attempts = 0,
      locked_until = null,
      verified_employee_id = case when a.verified_employee_id = p_employee_id then null else a.verified_employee_id end,
      pin_verified_at = case when a.verified_employee_id = p_employee_id then null else a.pin_verified_at end,
      updated_at = now()
  where a.shop_id = v_shop_id;
  return jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_configured', true, 'pin_enabled', true);
end;
$function$;

create or replace function public.admin_reset_employee_pin_attempts(p_employee_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_shop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'EMPLOYEE_PIN_ADMIN_AUTH_REQUIRED' using errcode = '42501';
  end if;
  select e.shop_id into v_shop_id
  from public.staff_employees e
  where e.id = p_employee_id and e.deleted_at is null;
  if v_shop_id is null or not public.has_shop_role(v_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  update public.staff_employee_pin_attempts a
  set failed_attempts = 0, locked_until = null, updated_at = now()
  where a.shop_id = v_shop_id;
  return jsonb_build_object('success', true, 'employee_id', p_employee_id, 'attempts_reset', true);
end;
$function$;

create or replace function public.staff_employee_pin_is_verified(p_shop_id uuid, p_employee_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = ''
as $function$
  select auth.uid() is not null and exists (
    select 1
    from public.staff_employee_pin_attempts a
    join public.staff_employees e on e.id = a.verified_employee_id and e.shop_id = a.shop_id
    where a.user_id = auth.uid()
      and a.shop_id = p_shop_id
      and a.pin_verified_at > now() - interval '8 hours'
      and (p_employee_id is null or a.verified_employee_id = p_employee_id)
      and e.is_active and e.deleted_at is null and e.withdrawal_pin_enabled
  );
$function$;

create or replace function public.verify_staff_pin_access(p_shop_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_pin text;
  v_failures integer;
  v_locked_until timestamptz;
  v_match_count integer;
  v_employee public.staff_employees%rowtype;
begin
  if v_user_id is null or not public.is_shop_member(p_shop_id) then
    return jsonb_build_object('success', false);
  end if;
  v_pin := translate(regexp_replace(coalesce(p_pin, ''), '[[:space:]]+', '', 'g'),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  if v_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('success', false);
  end if;

  insert into public.staff_employee_pin_attempts(user_id, shop_id)
  values (v_user_id, p_shop_id)
  on conflict (user_id, shop_id) do nothing;
  select a.failed_attempts, a.locked_until into v_failures, v_locked_until
  from public.staff_employee_pin_attempts a
  where a.user_id = v_user_id and a.shop_id = p_shop_id
  for update;
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('success', false, 'locked', true);
  end if;

  select count(*) into v_match_count
  from public.staff_employees e
  where e.shop_id = p_shop_id and e.deleted_at is null and e.is_active
    and e.withdrawal_pin_enabled and e.withdrawal_pin_hash is not null
    and extensions.crypt(v_pin, e.withdrawal_pin_hash) = e.withdrawal_pin_hash;
  if v_match_count = 1 then
    select e.* into v_employee
    from public.staff_employees e
    where e.shop_id = p_shop_id and e.deleted_at is null and e.is_active
      and e.withdrawal_pin_enabled and e.withdrawal_pin_hash is not null
      and extensions.crypt(v_pin, e.withdrawal_pin_hash) = e.withdrawal_pin_hash
    limit 1;
  end if;

  if v_match_count <> 1 or v_employee.id is null then
    v_failures := coalesce(v_failures, 0) + 1;
    update public.staff_employee_pin_attempts a
    set failed_attempts = v_failures,
        locked_until = case when v_failures >= 5 then now() + interval '15 minutes' else null end,
        verified_employee_id = null, pin_verified_at = null, updated_at = now()
    where a.user_id = v_user_id and a.shop_id = p_shop_id;
    return jsonb_build_object('success', false, 'locked', v_failures >= 5);
  end if;

  update public.staff_employee_pin_attempts a
  set failed_attempts = 0, locked_until = null,
      verified_employee_id = v_employee.id, pin_verified_at = now(), updated_at = now()
  where a.user_id = v_user_id and a.shop_id = p_shop_id;
  return jsonb_build_object('success', true, 'employee', jsonb_build_object(
    'id', v_employee.id, 'name', v_employee.name, 'phone', v_employee.phone,
    'position', v_employee.position, 'role', v_employee.role, 'salary', v_employee.salary,
    'join_date', v_employee.join_date, 'hire_date', v_employee.hire_date,
    'shop_id', v_employee.shop_id, 'is_active', v_employee.is_active
  ));
end;
$function$;

-- Each authenticated member who passed PIN verification may see only the
-- employee identified by that PIN. Manager/admin management policies remain intact.
drop policy if exists staff_employees_employee_read on public.staff_employees;
create policy staff_employees_employee_read on public.staff_employees for select to authenticated
using (public.is_shop_member(shop_id) and public.staff_employee_pin_is_verified(shop_id, id) and is_active and deleted_at is null);
drop policy if exists staff_employees_supervisor_read on public.staff_employees;
create policy staff_employees_supervisor_read on public.staff_employees for select to authenticated
using (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, id) and deleted_at is null);

drop policy if exists staff_attendance_employee_read on public.staff_attendance;
create policy staff_attendance_employee_read on public.staff_attendance for select to authenticated
using (public.is_shop_member(shop_id) and public.staff_employee_pin_is_verified(shop_id, employee_id));
drop policy if exists staff_attendance_supervisor_pin_read on public.staff_attendance;
create policy staff_attendance_supervisor_pin_read on public.staff_attendance for select to authenticated
using (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id));
drop policy if exists staff_attendance_manager_insert on public.staff_attendance;
create policy staff_attendance_manager_insert on public.staff_attendance for insert to authenticated
with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])
  or (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id)));
drop policy if exists staff_attendance_manager_update on public.staff_attendance;
create policy staff_attendance_manager_update on public.staff_attendance for update to authenticated
using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])
  or (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id)))
with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])
  or (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id)));

drop policy if exists staff_withdrawals_employee_read on public.staff_withdrawals;
create policy staff_withdrawals_employee_read on public.staff_withdrawals for select to authenticated
using (public.is_shop_member(shop_id) and public.staff_employee_pin_is_verified(shop_id, employee_id)
  and exists (select 1 from public.staff_employees e where e.id = staff_withdrawals.employee_id and e.shop_id = staff_withdrawals.shop_id and e.is_active and e.deleted_at is null));
drop policy if exists staff_withdrawals_employee_insert on public.staff_withdrawals;
create policy staff_withdrawals_employee_insert on public.staff_withdrawals for insert to authenticated
with check (public.is_shop_member(shop_id) and public.staff_employee_pin_is_verified(shop_id, employee_id)
  and exists (select 1 from public.staff_employees e where e.id = staff_withdrawals.employee_id and e.shop_id = staff_withdrawals.shop_id and e.is_active and e.deleted_at is null)
  and status = 'pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists staff_withdrawals_supervisor_pin_read on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_read on public.staff_withdrawals for select to authenticated
using (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id));
drop policy if exists staff_withdrawals_supervisor_pin_insert on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_insert on public.staff_withdrawals for insert to authenticated
with check (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[])
  and public.staff_employee_pin_is_verified(shop_id, employee_id)
  and status = 'pending' and reviewed_at is null and reviewed_by is null);
drop policy if exists staff_withdrawals_supervisor_pin_update on public.staff_withdrawals;
create policy staff_withdrawals_supervisor_pin_update on public.staff_withdrawals for update to authenticated
using (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id))
with check (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id));
drop policy if exists staff_withdrawals_manager_delete on public.staff_withdrawals;
create policy staff_withdrawals_manager_delete on public.staff_withdrawals for delete to authenticated
using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])
  or (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id, employee_id)));

-- Remove any lockouts that were already persisted by the mismatched PIN flow.
update public.staff_employee_pin_attempts
set failed_attempts = 0, locked_until = null, updated_at = now()
where failed_attempts <> 0 or locked_until is not null;

revoke all on function public.admin_set_employee_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_employee_pin(uuid, text) to authenticated;
revoke all on function public.admin_reset_employee_pin_attempts(uuid) from public, anon, authenticated;
grant execute on function public.admin_reset_employee_pin_attempts(uuid) to authenticated;
revoke all on function public.staff_employee_pin_is_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.staff_employee_pin_is_verified(uuid, uuid) to authenticated;
revoke all on function public.verify_staff_pin_access(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin_access(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
