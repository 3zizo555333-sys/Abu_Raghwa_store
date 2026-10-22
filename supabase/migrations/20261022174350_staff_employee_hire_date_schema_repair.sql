begin;

-- Keep the deployed employee schema compatible with the current client payload.
-- Existing UI fields map to auth_email and position; shop_id/join_date remain
-- canonical for existing access-control and finance queries.
alter table public.staff_employees
  add column if not exists store_id uuid,
  add column if not exists hire_date date;

update public.staff_employees
set store_id = shop_id
where store_id is null;

update public.staff_employees
set hire_date = coalesce(join_date, current_date)
where hire_date is null;

alter table public.staff_employees
  alter column store_id set not null,
  alter column hire_date set default current_date,
  alter column hire_date set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff_employees'::regclass
      and conname = 'staff_employees_store_id_fkey'
  ) then
    alter table public.staff_employees
      add constraint staff_employees_store_id_fkey
      foreign key (store_id) references public.shops(id) on delete cascade;
  end if;
end;
$$;

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

revoke all on function public.sync_staff_employee_store_fields() from public, anon, authenticated;
drop trigger if exists staff_employees_sync_store_fields on public.staff_employees;
create trigger staff_employees_sync_store_fields
before insert or update of shop_id, store_id, join_date, hire_date on public.staff_employees
for each row execute function public.sync_staff_employee_store_fields();

-- The existing composite FK (employee_id, shop_id) -> (id, shop_id) on
-- staff_withdrawals is retained; it provides tenant-safe employee linkage.
notify pgrst, 'reload schema';
commit;
