begin;

create or replace function public.bind_staff_employee_auth(p_shop_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_employee jsonb;
begin
  if auth.uid() is null or not public.is_shop_member(p_shop_id) then
    raise exception 'STAFF_AUTH_BIND_FORBIDDEN' using errcode = '42501';
  end if;
  select lower(nullif(btrim(u.email), '')) into v_email
  from auth.users u
  where u.id = auth.uid();
  if v_email is null then return null; end if;

  update public.staff_employees
  set auth_user_id = auth.uid(), auth_email = v_email
  where shop_id = p_shop_id
    and deleted_at is null
    and lower(auth_email) = v_email;

  select jsonb_build_object(
    'id', e.id, 'name', e.name, 'phone', e.phone,
    'auth_email', e.auth_email, 'auth_user_id', e.auth_user_id,
    'role', e.role, 'salary', e.salary, 'is_active', e.is_active,
    'join_date', e.join_date, 'hire_date', e.hire_date,
    'shop_id', e.shop_id, 'store_id', e.store_id
  ) into v_employee
  from public.staff_employees e
  where e.shop_id = p_shop_id
    and e.deleted_at is null
    and lower(e.auth_email) = v_email
  limit 1;
  return coalesce(v_employee, '{}'::jsonb);
end;
$$;

revoke all on function public.bind_staff_employee_auth(uuid) from public, anon;
grant execute on function public.bind_staff_employee_auth(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
