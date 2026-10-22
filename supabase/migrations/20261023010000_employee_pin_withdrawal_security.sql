begin;

alter table public.staff_employees
  add column if not exists withdrawal_pin_hash text;
comment on column public.staff_employees.withdrawal_pin_hash is
  'Bcrypt hash of the employee withdrawal PIN; never returned to client queries.';

create table if not exists public.staff_employee_pin_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  verified_employee_id uuid,
  pin_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
alter table public.staff_employee_pin_attempts enable row level security;
alter table public.staff_employee_pin_attempts force row level security;
revoke all on public.staff_employee_pin_attempts from public, anon, authenticated;

-- Manager-assigned employee PINs are salted bcrypt hashes; the raw PIN is never stored or returned.
create or replace function public.admin_set_employee_pin(p_employee_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
begin
  if auth.uid() is null then
    raise exception 'EMPLOYEE_PIN_ADMIN_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    raise exception 'EMPLOYEE_PIN_MUST_BE_4_DIGITS' using errcode = '22023';
  end if;

  select e.shop_id into v_shop_id
  from public.staff_employees e
  where e.id = p_employee_id and e.deleted_at is null;

  if v_shop_id is null
    or not public.has_shop_role(v_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_ADMIN_FORBIDDEN' using errcode = '42501';
  end if;

  update public.staff_employees e
  set withdrawal_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
      is_active = true,
      updated_at = now()
  where e.id = p_employee_id and e.shop_id = v_shop_id and e.deleted_at is null;

  return jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_configured', true);
end;
$$;

create or replace function public.list_staff_employee_pin_statuses(p_shop_id uuid)
returns table(employee_id uuid, pin_configured boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_STATUS_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select e.id, e.withdrawal_pin_hash is not null
  from public.staff_employees e
  where e.shop_id = p_shop_id and e.deleted_at is null
  order by e.name;
end;
$$;

-- The RLS policies below also check this time-limited server-side verification marker.
create or replace function public.staff_employee_pin_is_verified(p_shop_id uuid, p_employee_id uuid default null)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.staff_employee_pin_attempts a
    where a.user_id = auth.uid()
      and a.shop_id = p_shop_id
      and a.pin_verified_at > now() - interval '8 hours'
      and (p_employee_id is null or a.verified_employee_id = p_employee_id)
      and (
        not public.has_shop_role(p_shop_id, array['admin','supervisor']::public.shop_role[])
        or exists (
          select 1 from public.staff_employees e
          where e.id = a.verified_employee_id
            and e.shop_id = p_shop_id
            and e.role = 'supervisor'
            and e.is_active and e.deleted_at is null
        )
      )
  );
$$;

create or replace function public.verify_current_staff_pin(p_shop_id uuid, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_failures integer;
  v_locked_until timestamptz;
  v_employee record;
begin
  if v_user_id is null or not public.is_shop_member(p_shop_id) then
    return jsonb_build_object('success', false);
  end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('success', false);
  end if;

  insert into public.staff_employee_pin_attempts(user_id, shop_id)
  values (v_user_id, p_shop_id)
  on conflict (user_id, shop_id) do nothing;

  select a.failed_attempts, a.locked_until
    into v_failures, v_locked_until
  from public.staff_employee_pin_attempts a
  where a.user_id = v_user_id and a.shop_id = p_shop_id
  for update;

  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('success', false, 'locked', true);
  end if;

  select e.id, e.name, e.phone, e.position, e.role, e.salary, e.join_date,
         e.hire_date, e.shop_id, e.is_active, e.withdrawal_pin_hash
    into v_employee
  from public.staff_employees e
  where e.shop_id = p_shop_id
    and e.deleted_at is null
    and e.is_active
    and (
      not public.has_shop_role(p_shop_id, array['admin','supervisor']::public.shop_role[])
      or e.role = 'supervisor'
    )
    and (e.auth_user_id = v_user_id or (v_email <> '' and lower(e.auth_email) = v_email))
  order by (e.auth_user_id = v_user_id) desc
  limit 1;

  if v_employee.id is null
    or v_employee.withdrawal_pin_hash is null
    or extensions.crypt(p_pin, v_employee.withdrawal_pin_hash) <> v_employee.withdrawal_pin_hash then
    v_failures := coalesce(v_failures, 0) + 1;
    update public.staff_employee_pin_attempts a
    set failed_attempts = v_failures,
        locked_until = case when v_failures >= 5 then now() + interval '15 minutes' else null end,
        verified_employee_id = null,
        pin_verified_at = null,
        updated_at = now()
    where a.user_id = v_user_id and a.shop_id = p_shop_id;
    return jsonb_build_object('success', false, 'locked', v_failures >= 5);
  end if;

  update public.staff_employee_pin_attempts a
  set failed_attempts = 0,
      locked_until = null,
      verified_employee_id = v_employee.id,
      pin_verified_at = now(),
      updated_at = now()
  where a.user_id = v_user_id and a.shop_id = p_shop_id;

  return jsonb_build_object(
    'success', true,
    'employee', jsonb_build_object(
      'id', v_employee.id,
      'name', v_employee.name,
      'phone', v_employee.phone,
      'position', v_employee.position,
      'role', v_employee.role,
      'salary', v_employee.salary,
      'join_date', v_employee.join_date,
      'hire_date', v_employee.hire_date,
      'shop_id', v_employee.shop_id,
      'is_active', v_employee.is_active
    )
  );
end;
$$;

revoke all on function public.admin_set_employee_pin(uuid, text) from public, anon;
revoke all on function public.admin_set_employee_pin(uuid, text) from authenticated;
grant execute on function public.admin_set_employee_pin(uuid, text) to authenticated;
revoke all on function public.list_staff_employee_pin_statuses(uuid) from public, anon;
revoke all on function public.list_staff_employee_pin_statuses(uuid) from authenticated;
grant execute on function public.list_staff_employee_pin_statuses(uuid) to authenticated;
revoke all on function public.verify_current_staff_pin(uuid, text) from public, anon;
revoke all on function public.verify_current_staff_pin(uuid, text) from authenticated;
grant execute on function public.verify_current_staff_pin(uuid, text) to authenticated;
revoke all on function public.staff_employee_pin_is_verified(uuid, uuid) from public, anon;
revoke all on function public.staff_employee_pin_is_verified(uuid, uuid) from authenticated;
grant execute on function public.staff_employee_pin_is_verified(uuid, uuid) to authenticated;

-- Remove broad member policies; team views require a manager or a successful supervisor PIN.
drop policy if exists staff_employees_member_read on public.staff_employees;
drop policy if exists staff_employees_manager_read on public.staff_employees;
drop policy if exists staff_employees_employee_read on public.staff_employees;
drop policy if exists staff_employees_supervisor_read on public.staff_employees;
create policy staff_employees_manager_read
  on public.staff_employees for select to authenticated
  using (public.has_shop_role(shop_id, array['manager']::public.shop_role[]) and deleted_at is null);
create policy staff_employees_supervisor_read
  on public.staff_employees for select to authenticated
  using (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
    and deleted_at is null
  );
create policy staff_employees_employee_read
  on public.staff_employees for select to authenticated
  using (
    public.is_shop_member(shop_id)
    and public.staff_employee_pin_is_verified(shop_id, id)
    and is_active and deleted_at is null
    and (auth_user_id = auth.uid() or lower(auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  );

-- Workers may read only their own attendance; management reads require manager role or PIN.
drop policy if exists staff_attendance_member_read on public.staff_attendance;
drop policy if exists staff_attendance_manager_read on public.staff_attendance;
drop policy if exists staff_attendance_employee_read on public.staff_attendance;
drop policy if exists staff_attendance_supervisor_pin_read on public.staff_attendance;
create policy staff_attendance_manager_read
  on public.staff_attendance for select to authenticated
  using (public.has_shop_role(shop_id, array['manager']::public.shop_role[]));
create policy staff_attendance_supervisor_pin_read
  on public.staff_attendance for select to authenticated
  using (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
  );
create policy staff_attendance_employee_read
  on public.staff_attendance for select to authenticated
  using (
    public.is_shop_member(shop_id)
    and public.staff_employee_pin_is_verified(shop_id, employee_id)
    and exists (
      select 1 from public.staff_employees e
      where e.id = staff_attendance.employee_id
        and e.shop_id = staff_attendance.shop_id
        and e.is_active and e.deleted_at is null
        and (e.auth_user_id = auth.uid() or lower(e.auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

-- Only managers or a PIN-verified supervisor can see team withdrawals.
drop policy if exists staff_withdrawals_member_read on public.staff_withdrawals;
drop policy if exists staff_withdrawals_manager_read on public.staff_withdrawals;
drop policy if exists staff_withdrawals_employee_read on public.staff_withdrawals;
drop policy if exists staff_withdrawals_supervisor_pin_read on public.staff_withdrawals;
create policy staff_withdrawals_manager_read
  on public.staff_withdrawals for select to authenticated
  using (public.has_shop_role(shop_id, array['manager']::public.shop_role[]));
create policy staff_withdrawals_supervisor_pin_read
  on public.staff_withdrawals for select to authenticated
  using (
    public.has_shop_role(shop_id, array['admin','supervisor']::public.shop_role[])
    and public.staff_employee_pin_is_verified(shop_id)
  );
create policy staff_withdrawals_employee_read
  on public.staff_withdrawals for select to authenticated
  using (
    public.is_shop_member(shop_id)
    and public.staff_employee_pin_is_verified(shop_id, employee_id)
    and exists (
      select 1 from public.staff_employees e
      where e.id = staff_withdrawals.employee_id
        and e.shop_id = staff_withdrawals.shop_id
        and e.is_active and e.deleted_at is null
        and (e.auth_user_id = auth.uid() or lower(e.auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
  );

-- Employees can create only their own pending withdrawal after the PIN gate has passed.
drop policy if exists staff_withdrawals_employee_insert on public.staff_withdrawals;
create policy staff_withdrawals_employee_insert
  on public.staff_withdrawals for insert to authenticated
  with check (
    public.is_shop_member(shop_id)
    and public.staff_employee_pin_is_verified(shop_id, employee_id)
    and exists (
      select 1 from public.staff_employees e
      where e.id = staff_withdrawals.employee_id
        and e.shop_id = staff_withdrawals.shop_id
        and e.is_active and e.deleted_at is null
        and (e.auth_user_id = auth.uid() or lower(e.auth_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
    )
    and status = 'pending'
    and reviewed_at is null
    and reviewed_by is null
  );

-- Supervisors may adjust amount/description, but only the manager can delete or approve/reject.
drop policy if exists staff_withdrawals_manager_delete on public.staff_withdrawals;
create policy staff_withdrawals_manager_delete
  on public.staff_withdrawals for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager']::public.shop_role[]));

create or replace function public.guard_staff_withdrawal_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status is distinct from old.status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by)
    and not public.has_shop_role(old.shop_id, array['manager']::public.shop_role[]) then
    raise exception 'STAFF_WITHDRAWAL_REVIEW_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists staff_withdrawals_review_fields_guard on public.staff_withdrawals;
create trigger staff_withdrawals_review_fields_guard
  before update on public.staff_withdrawals
  for each row execute function public.guard_staff_withdrawal_review_fields();
revoke all on function public.guard_staff_withdrawal_review_fields() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
