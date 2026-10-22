begin;

alter table public.staff_employees
  add column if not exists withdrawal_pin_enabled boolean not null default true;
comment on column public.staff_employees.withdrawal_pin_enabled is
  'Manager-controlled access flag for the employee withdrawal PIN card.';

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
  select e.shop_id into v_shop_id from public.staff_employees e where e.id = p_employee_id and e.deleted_at is null;
  if v_shop_id is null or not public.has_shop_role(v_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_ADMIN_FORBIDDEN' using errcode = '42501';
  end if;
  update public.staff_employees e
  set withdrawal_pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 12)),
      withdrawal_pin_enabled = true,
      updated_at = now()
  where e.id = p_employee_id and e.shop_id = v_shop_id and e.deleted_at is null;
  update public.staff_employee_pin_attempts a
  set verified_employee_id = null, pin_verified_at = null, updated_at = now()
  where a.shop_id = v_shop_id and a.verified_employee_id = p_employee_id;
  return jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_configured', true, 'pin_enabled', true);
end;
$$;

create or replace function public.admin_set_employee_pin_access(p_employee_id uuid, p_enabled boolean)
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
  select e.shop_id into v_shop_id
  from public.staff_employees e
  where e.id = p_employee_id and e.deleted_at is null and e.withdrawal_pin_hash is not null;
  if v_shop_id is null or not public.has_shop_role(v_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_ACCESS_FORBIDDEN' using errcode = '42501';
  end if;
  update public.staff_employees e
  set withdrawal_pin_enabled = p_enabled, updated_at = now()
  where e.id = p_employee_id and e.shop_id = v_shop_id and e.deleted_at is null;
  if not p_enabled then
    update public.staff_employee_pin_attempts a
    set verified_employee_id = null, pin_verified_at = null, updated_at = now()
    where a.shop_id = v_shop_id and a.verified_employee_id = p_employee_id;
  end if;
  return jsonb_build_object('success', true, 'employee_id', p_employee_id, 'pin_enabled', p_enabled);
end;
$$;

-- The status response contains booleans only, never the hash.
drop function if exists public.list_staff_employee_pin_statuses(uuid);
create function public.list_staff_employee_pin_statuses(p_shop_id uuid)
returns table(employee_id uuid, pin_configured boolean, pin_enabled boolean)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception 'EMPLOYEE_PIN_STATUS_FORBIDDEN' using errcode = '42501';
  end if;
  return query
  select e.id, e.withdrawal_pin_hash is not null, e.withdrawal_pin_enabled
  from public.staff_employees e
  where e.shop_id = p_shop_id and e.deleted_at is null
  order by e.name;
end;
$$;

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
    join public.staff_employees e
      on e.id = a.verified_employee_id and e.shop_id = a.shop_id
    where a.user_id = auth.uid()
      and a.shop_id = p_shop_id
      and a.pin_verified_at > now() - interval '8 hours'
      and (p_employee_id is null or a.verified_employee_id = p_employee_id)
      and e.is_active and e.deleted_at is null and e.withdrawal_pin_enabled
      and (
        not public.has_shop_role(p_shop_id, array['admin','supervisor']::public.shop_role[])
        or e.role = 'supervisor'
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
  select a.failed_attempts, a.locked_until into v_failures, v_locked_until
  from public.staff_employee_pin_attempts a
  where a.user_id = v_user_id and a.shop_id = p_shop_id
  for update;
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object('success', false, 'locked', true);
  end if;
  select e.id, e.name, e.phone, e.position, e.role, e.salary, e.join_date,
         e.hire_date, e.shop_id, e.is_active, e.withdrawal_pin_hash, e.withdrawal_pin_enabled
    into v_employee
  from public.staff_employees e
  where e.shop_id = p_shop_id and e.deleted_at is null and e.is_active and e.withdrawal_pin_enabled
    and (not public.has_shop_role(p_shop_id, array['admin','supervisor']::public.shop_role[]) or e.role = 'supervisor')
    and (e.auth_user_id = v_user_id or (v_email <> '' and lower(e.auth_email) = v_email))
  order by (e.auth_user_id = v_user_id) desc
  limit 1;
  if v_employee.id is null or v_employee.withdrawal_pin_hash is null
    or extensions.crypt(p_pin, v_employee.withdrawal_pin_hash) <> v_employee.withdrawal_pin_hash then
    v_failures := coalesce(v_failures, 0) + 1;
    update public.staff_employee_pin_attempts a
    set failed_attempts = v_failures,
        locked_until = case when v_failures >= 5 then now() + interval '15 minutes' else null end,
        verified_employee_id = null, pin_verified_at = null, updated_at = now()
    where a.user_id = v_user_id and a.shop_id = p_shop_id;
    return jsonb_build_object('success', false, 'locked', v_failures >= 5);
  end if;
  update public.staff_employee_pin_attempts a
  set failed_attempts = 0, locked_until = null, verified_employee_id = v_employee.id,
      pin_verified_at = now(), updated_at = now()
  where a.user_id = v_user_id and a.shop_id = p_shop_id;
  return jsonb_build_object('success', true, 'employee', jsonb_build_object(
    'id', v_employee.id, 'name', v_employee.name, 'phone', v_employee.phone,
    'position', v_employee.position, 'role', v_employee.role, 'salary', v_employee.salary,
    'join_date', v_employee.join_date, 'hire_date', v_employee.hire_date,
    'shop_id', v_employee.shop_id, 'is_active', v_employee.is_active
  ));
end;
$$;

revoke all on function public.admin_set_employee_pin_access(uuid, boolean) from public, anon, authenticated;
grant execute on function public.admin_set_employee_pin_access(uuid, boolean) to authenticated;
revoke all on function public.admin_set_employee_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_employee_pin(uuid, text) to authenticated;
revoke all on function public.list_staff_employee_pin_statuses(uuid) from public, anon, authenticated;
grant execute on function public.list_staff_employee_pin_statuses(uuid) to authenticated;
revoke all on function public.staff_employee_pin_is_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.staff_employee_pin_is_verified(uuid, uuid) to authenticated;
revoke all on function public.verify_current_staff_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_current_staff_pin(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
