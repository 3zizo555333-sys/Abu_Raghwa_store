begin;

-- The page uses one explicit PIN gate for every staff rank.
create or replace function public.verify_staff_pin_access(p_shop_id uuid, p_pin text)
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
      'id', v_employee.id, 'name', v_employee.name, 'phone', v_employee.phone,
      'position', v_employee.position, 'role', v_employee.role, 'salary', v_employee.salary,
      'join_date', v_employee.join_date, 'hire_date', v_employee.hire_date,
      'shop_id', v_employee.shop_id, 'is_active', v_employee.is_active
    )
  );
end;
$$;

-- Keep the verification marker scoped to the current authenticated user and shop.
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
  );
$$;

revoke all on function public.verify_staff_pin_access(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin_access(uuid, text) to authenticated;
revoke all on function public.staff_employee_pin_is_verified(uuid, uuid) from public, anon, authenticated;
grant execute on function public.staff_employee_pin_is_verified(uuid, uuid) to authenticated;

-- Remove the old broad insert path: every insert must satisfy one of the scoped policies.
drop policy if exists staff_can_insert_withdrawals on public.staff_withdrawals;

-- Supervisors may settle and delete only after their own PIN has been verified.
drop policy if exists staff_withdrawals_manager_delete on public.staff_withdrawals;
create policy staff_withdrawals_manager_delete
  on public.staff_withdrawals for delete to authenticated
  using (
    public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])
    or (public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]) and public.staff_employee_pin_is_verified(shop_id))
  );

create or replace function public.guard_staff_withdrawal_review_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.has_shop_role(old.shop_id, array['manager','admin']::public.shop_role[]) then
    return new;
  end if;
  if not public.has_shop_role(old.shop_id, array['supervisor']::public.shop_role[])
     or not public.staff_employee_pin_is_verified(old.shop_id) then
    raise exception 'STAFF_WITHDRAWAL_SUPERVISOR_PIN_REQUIRED' using errcode='42501';
  end if;
  if (to_jsonb(new)-array['amount','description','status','reviewed_at','reviewed_by','updated_at'])
     is distinct from (to_jsonb(old)-array['amount','description','status','reviewed_at','reviewed_by','updated_at']) then
    raise exception 'STAFF_WITHDRAWAL_SUPERVISOR_FIELDS_FORBIDDEN' using errcode='42501';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
commit;
