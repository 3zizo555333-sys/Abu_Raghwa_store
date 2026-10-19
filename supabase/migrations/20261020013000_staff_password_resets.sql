begin;

create table if not exists public.staff_password_resets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  employee_id uuid references public.staff_employees(id) on delete set null,
  identifier text not null,
  requested_email text,
  requested_phone text,
  status text not null default 'pending' check (status in ('pending','resolved','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists staff_password_resets_shop_status_idx
  on public.staff_password_resets(shop_id, status, created_at desc);

alter table public.staff_password_resets enable row level security;
alter table public.staff_password_resets force row level security;
revoke all on public.staff_password_resets from public, anon, authenticated;
grant select, update on public.staff_password_resets to authenticated;

drop policy if exists staff_password_resets_manager_read on public.staff_password_resets;
create policy staff_password_resets_manager_read
on public.staff_password_resets for select to authenticated
using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

drop policy if exists staff_password_resets_manager_update on public.staff_password_resets;
create policy staff_password_resets_manager_update
on public.staff_password_resets for update to authenticated
using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create or replace function public.request_staff_password_reset(p_identifier text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_identifier text := lower(btrim(coalesce(p_identifier, '')));
  v_employee record;
begin
  if length(v_identifier) < 3 then
    return jsonb_build_object('accepted', false, 'message', 'أدخل البريد الإلكتروني أو رقم الهاتف المسجل.');
  end if;

  select e.id, e.shop_id, e.auth_email, e.phone
  into v_employee
  from public.staff_employees e
  where e.deleted_at is null
    and (lower(e.auth_email) = v_identifier or regexp_replace(e.phone, '[^0-9]+', '', 'g') = regexp_replace(v_identifier, '[^0-9]+', '', 'g'))
  order by e.created_at desc
  limit 1;

  -- Always return the same accepted response for unknown identifiers.
  if v_employee.id is not null then
    insert into public.staff_password_resets(shop_id, employee_id, identifier, requested_email, requested_phone)
    values (v_employee.shop_id, v_employee.id, v_identifier, v_employee.auth_email, v_employee.phone);
  end if;
  return jsonb_build_object('accepted', true);
end;
$$;

create or replace function public.list_staff_password_reset_requests(p_shop_id uuid)
returns table (
  id uuid,
  shop_id uuid,
  employee_id uuid,
  employee_name text,
  identifier text,
  requested_email text,
  requested_phone text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception 'PASSWORD_RESET_REQUESTS_FORBIDDEN' using errcode = '42501';
  end if;
  return query
    select r.id, r.shop_id, r.employee_id, e.name, r.identifier,
      r.requested_email, r.requested_phone, r.status, r.created_at
    from public.staff_password_resets r
    left join public.staff_employees e on e.id = r.employee_id
    where r.shop_id = p_shop_id and r.status = 'pending'
    order by r.created_at desc
    limit 100;
end;
$$;

create or replace function public.manager_set_staff_password(
  p_shop_id uuid,
  p_employee_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_employee record;
  v_auth_user_id uuid;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception 'PASSWORD_RESET_FORBIDDEN' using errcode = '42501';
  end if;
  if length(coalesce(p_password, '')) < 8 then
    raise exception 'كلمة المرور يجب أن تتكون من 8 أحرف على الأقل';
  end if;

  select e.* into v_employee
  from public.staff_employees e
  where e.id = p_employee_id and e.shop_id = p_shop_id and e.deleted_at is null
  for update;
  if v_employee.id is null then raise exception 'لم أجد الموظف المرتبط بطلب الاستعادة'; end if;

  v_auth_user_id := v_employee.auth_user_id;
  if v_auth_user_id is null and v_employee.auth_email is not null then
    select u.id into v_auth_user_id from auth.users u where lower(u.email) = lower(v_employee.auth_email) limit 1;
  end if;
  if v_auth_user_id is null then raise exception 'لم يتم العثور على حساب Auth مرتبط بهذا الموظف'; end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = v_auth_user_id;

  update public.staff_employees set auth_user_id = v_auth_user_id where id = v_employee.id;
  update public.staff_password_resets
  set status = 'resolved', resolved_at = now(), resolved_by = auth.uid()
  where shop_id = p_shop_id and employee_id = p_employee_id and status = 'pending';
  return jsonb_build_object('success', true);
end;
$$;

revoke all on function public.request_staff_password_reset(text) from public, anon;
grant execute on function public.request_staff_password_reset(text) to anon, authenticated;
revoke all on function public.list_staff_password_reset_requests(uuid) from public, anon;
grant execute on function public.list_staff_password_reset_requests(uuid) to authenticated;
revoke all on function public.manager_set_staff_password(uuid, uuid, text) from public, anon;
grant execute on function public.manager_set_staff_password(uuid, uuid, text) to authenticated;
notify pgrst, 'reload schema';
commit;
