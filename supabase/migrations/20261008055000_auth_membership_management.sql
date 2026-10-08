-- Supabase Auth onboarding and manager-only membership administration.
-- New self-registrations can only request a pending seller membership; they
-- never receive access or a privileged role until an active manager approves.
begin;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_shop_count bigint;
  v_shop_id uuid;
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'full_name'), ''))
  on conflict (user_id) do update set display_name = coalesce(excluded.display_name, public.profiles.display_name);

  select count(*) into v_shop_count from public.shops;
  if v_shop_count = 1 then
    select id into v_shop_id from public.shops limit 1;
    insert into public.shop_memberships(user_id, shop_id, role, status)
    values (new.id, v_shop_id, 'seller', 'pending')
    on conflict (user_id, shop_id) do nothing;
  end if;
  return new;
end;
$$;

-- Managers may see pending registrants' basic profiles so they can approve them.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_or_manager_read on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.shop_memberships mine
      join public.shop_memberships theirs on theirs.shop_id = mine.shop_id
      where mine.user_id = (select auth.uid())
        and mine.status = 'active'
        and mine.role in ('manager','admin','supervisor')
        and theirs.user_id = profiles.user_id
    )
  );

create or replace function public.list_shop_members(p_shop_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.shop_role,
  status public.membership_status,
  created_at timestamptz,
  updated_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'MEMBERSHIP_MANAGEMENT_FORBIDDEN';
  end if;
  return query
    select m.user_id, coalesce(u.email, ''), p.display_name, m.role, m.status,
      m.created_at, m.updated_at, u.last_sign_in_at
    from public.shop_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.shop_id = p_shop_id
    order by case m.status when 'pending' then 0 when 'active' then 1 else 2 end, m.created_at;
end;
$$;

create or replace function public.set_shop_membership(
  p_shop_id uuid,
  p_user_id uuid,
  p_role public.shop_role,
  p_status public.membership_status
)
returns public.shop_memberships
language plpgsql security definer set search_path = '' as $$
declare
  v_existing public.shop_memberships;
  v_updated public.shop_memberships;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'MEMBERSHIP_MANAGEMENT_FORBIDDEN';
  end if;
  if p_role is null or p_status is null or p_role not in ('seller','admin') or p_status not in ('pending','active','suspended') then
    raise exception using errcode = '22023', message = 'INVALID_MEMBERSHIP_CHANGE';
  end if;
  if p_user_id = (select auth.uid()) then
    raise exception using errcode = '42501', message = 'CANNOT_CHANGE_OWN_MEMBERSHIP';
  end if;
  select * into v_existing from public.shop_memberships
    where shop_id = p_shop_id and user_id = p_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'MEMBERSHIP_NOT_FOUND'; end if;
  if v_existing.role = 'manager' then
    raise exception using errcode = '42501', message = 'CANNOT_CHANGE_MANAGER_MEMBERSHIP';
  end if;
  update public.shop_memberships
    set role = p_role,
        status = p_status,
        approved_by = case when p_status = 'active' then (select auth.uid()) else approved_by end
    where shop_id = p_shop_id and user_id = p_user_id
    returning * into v_updated;
  return v_updated;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function public.list_shop_members(uuid) from public, anon;
revoke all on function public.set_shop_membership(uuid, uuid, public.shop_role, public.membership_status) from public, anon;
grant execute on function public.list_shop_members(uuid) to authenticated;
grant execute on function public.set_shop_membership(uuid, uuid, public.shop_role, public.membership_status) to authenticated;

commit;
