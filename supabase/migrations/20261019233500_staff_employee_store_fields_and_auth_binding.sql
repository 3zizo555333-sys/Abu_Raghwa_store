begin;

-- Keep the application-facing aliases in sync while shop_id/join_date remain
-- compatible with all existing staff queries and finance calculations.
alter table public.staff_employees
  add column if not exists store_id uuid,
  add column if not exists hire_date date;

update public.staff_employees
set store_id = shop_id
where store_id is null;

update public.staff_employees
set hire_date = join_date
where hire_date is null;

alter table public.staff_employees
  alter column store_id set not null,
  alter column hire_date set not null;

alter table public.staff_employees
  drop constraint if exists staff_employees_auth_user_id_fkey;

alter table public.staff_employees
  add constraint staff_employees_store_id_fkey
  foreign key (store_id) references public.shops(id) on delete cascade;

create or replace function public.sync_staff_employee_store_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shop_id is null and new.store_id is null then
    raise exception 'staff_employees requires shop_id or store_id';
  end if;
  if new.shop_id is null then new.shop_id := new.store_id; end if;
  if new.store_id is null then new.store_id := new.shop_id; end if;
  if new.shop_id <> new.store_id then
    raise exception 'staff_employees shop_id and store_id must match';
  end if;
  if new.join_date is null and new.hire_date is null then
    new.join_date := current_date;
    new.hire_date := new.join_date;
  elsif new.join_date is null then
    new.join_date := new.hire_date;
  elsif new.hire_date is null then
    new.hire_date := new.join_date;
  else
    new.hire_date := new.join_date;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_employees_sync_store_fields on public.staff_employees;
create trigger staff_employees_sync_store_fields
before insert or update of shop_id, store_id, join_date, hire_date on public.staff_employees
for each row execute function public.sync_staff_employee_store_fields();

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
  if v_email is null then
    return null;
  end if;
  update public.staff_employees
  set auth_user_id = auth.uid(), auth_email = v_email
  where shop_id = p_shop_id
    and deleted_at is null
    and lower(auth_email) = v_email;
  select jsonb_build_object(
    'id', e.id,
    'name', e.name,
    'phone', e.phone,
    'auth_email', e.auth_email,
    'auth_user_id', e.auth_user_id,
    'role', e.role,
    'salary', e.salary,
    'is_active', e.is_active,
    'join_date', e.join_date,
    'hire_date', e.hire_date,
    'shop_id', e.shop_id,
    'store_id', e.store_id
  ) into v_employee
  from public.staff_employees e
  where e.shop_id = p_shop_id
    and e.deleted_at is null
    and lower(e.auth_email) = v_email
  limit 1;
  return coalesce(v_employee, '{}'::jsonb);
end;
$$;

revoke all on function public.sync_staff_employee_store_fields() from public, anon, authenticated;
revoke all on function public.bind_staff_employee_auth(uuid) from public, anon;
grant execute on function public.bind_staff_employee_auth(uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
