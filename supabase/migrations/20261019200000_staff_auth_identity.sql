begin;

alter table public.staff_employees
  add column if not exists auth_email text,
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

update public.staff_employees
set auth_email = nullif(lower(btrim(metadata->>'auth_email')), '')
where auth_email is null
  and jsonb_typeof(metadata) = 'object'
  and nullif(lower(btrim(metadata->>'auth_email')), '') is not null;

create unique index if not exists staff_employees_shop_auth_email_uidx
  on public.staff_employees(shop_id, lower(auth_email))
  where deleted_at is null and auth_email is not null;
create unique index if not exists staff_employees_shop_auth_user_uidx
  on public.staff_employees(shop_id, auth_user_id)
  where deleted_at is null and auth_user_id is not null;

create or replace function public.sync_staff_auth_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.auth_email := nullif(lower(btrim(new.auth_email)), '');
  if new.auth_email is null then
    new.auth_user_id := null;
  else
    select u.id into new.auth_user_id
    from auth.users u
    where lower(u.email) = new.auth_email
    limit 1;
  end if;
  return new;
end;
$$;

drop trigger if exists staff_employees_sync_auth_identity on public.staff_employees;
create trigger staff_employees_sync_auth_identity
before insert or update of auth_email on public.staff_employees
for each row execute function public.sync_staff_auth_identity();

comment on column public.staff_employees.auth_email is 'Normalized Supabase Auth email used to match the staff identity.';
comment on column public.staff_employees.auth_user_id is 'Optional Supabase Auth user id bound to this staff record.';
revoke all on function public.sync_staff_auth_identity() from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
