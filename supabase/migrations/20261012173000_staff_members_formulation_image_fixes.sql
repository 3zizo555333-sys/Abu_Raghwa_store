begin;

-- Keep the RPC's returned columns aligned exactly with RETURNS TABLE. auth.users.email
-- is varchar(255), so cast it (and display_name) explicitly to text.
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
    select m.user_id,
      coalesce(u.email::text, ''::text)::text,
      p.display_name::text,
      m.role,
      m.status,
      m.created_at,
      m.updated_at,
      u.last_sign_in_at
    from public.shop_memberships m
    join auth.users u on u.id = m.user_id
    left join public.profiles p on p.user_id = m.user_id
    where m.shop_id = p_shop_id
    order by case m.status when 'pending' then 0 when 'active' then 1 else 2 end, m.created_at;
end;
$$;
revoke all on function public.list_shop_members(uuid) from public, anon;
grant execute on function public.list_shop_members(uuid) to authenticated;

-- Image metadata is stored in the private product-images bucket. Keep both
-- INSERT and UPDATE restricted to the matching shop's manager/admin/supervisor
-- and enforce the file constraints; the registration RPC remains responsible
-- for version-checking and linking the path to public.recipes.image_url.
drop policy if exists formulation_image_manager_insert on storage.objects;
create policy formulation_image_manager_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' = 'image/webp'
  );

drop policy if exists formulation_image_manager_update on storage.objects;
create policy formulation_image_manager_update on storage.objects for update to authenticated
  using (
    bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
  )
  with check (
    bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' = 'image/webp'
  );

notify pgrst, 'reload schema';
commit;
