begin;

-- Keep formulation photos in the existing private product-images bucket.
-- Catalog visibility is an explicit opt-in; employee role is descriptive only
-- and does not grant application access (shop_memberships remains authoritative).
alter table public.recipes
  add column if not exists catalog_visible boolean not null default false,
  add column if not exists catalog_price numeric(18,4) check (catalog_price is null or catalog_price >= 0),
  add column if not exists catalog_old_price numeric(18,4) check (catalog_old_price is null or catalog_old_price >= 0),
  add column if not exists catalog_description text not null default '',
  add column if not exists catalog_details_url text not null default '',
  add column if not exists catalog_category text not null default 'تركيبات',
  add column if not exists catalog_company text not null default 'أبو رغوة';

alter table public.staff_employees
  add column if not exists role text not null default 'seller';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.staff_employees'::regclass
      and conname = 'staff_employees_role_check'
  ) then
    alter table public.staff_employees
      add constraint staff_employees_role_check check (role in ('supervisor','cashier','seller'));
  end if;
end;
$$;

create or replace view public.formulations with (security_invoker=true) as
  select id,shop_id,name,description,cost_price,retail_price,category,version,production_quantity,production_unit,notes,loyalty_points,image_url,is_password_protected,password_hash,created_at,updated_at,deleted_at,
         catalog_visible,catalog_price,catalog_old_price,catalog_description,catalog_details_url,catalog_category,catalog_company
  from public.recipes;
grant select,insert,update on public.formulations to authenticated;

create or replace function public.formulation_image_shop_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/formulations/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.]webp$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function public.formulation_image_shop_from_path(text) from public, anon;
grant execute on function public.formulation_image_shop_from_path(text) to authenticated;

-- Storage remains private. Members can create signed URLs only for images in
-- their shop, while uploads/deletes require an authorized manager role.
drop policy if exists formulation_image_member_read on storage.objects;
drop policy if exists formulation_image_manager_insert on storage.objects;
drop policy if exists formulation_image_manager_delete on storage.objects;
create policy formulation_image_member_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.is_shop_member(public.formulation_image_shop_from_path(name)));
create policy formulation_image_manager_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' = 'image/webp');
create policy formulation_image_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[]));

create or replace function public.register_formulation_image(
  p_shop_id uuid,
  p_formulation_id uuid,
  p_expected_version bigint,
  p_image_id uuid,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_recipe public.recipes;
  v_metadata jsonb;
  v_object_size bigint;
  v_object_type text;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FORMULATION_IMAGE_FORBIDDEN';
  end if;
  if p_content_type <> 'image/webp' or p_size_bytes < 1 or p_size_bytes > 5242880 then
    raise exception using errcode = '22023', message = 'INVALID_FORMULATION_IMAGE';
  end if;
  if public.formulation_image_shop_from_path(p_storage_path) is distinct from p_shop_id
     or split_part(p_storage_path, '/', 3)::uuid is distinct from p_formulation_id
     or split_part(split_part(p_storage_path, '/', 4), '.', 1)::uuid is distinct from p_image_id then
    raise exception using errcode = '22023', message = 'INVALID_FORMULATION_IMAGE_PATH';
  end if;
  select * into v_recipe from public.recipes
    where id = p_formulation_id and shop_id = p_shop_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'FORMULATION_NOT_FOUND'; end if;
  if v_recipe.version <> p_expected_version then raise exception using errcode = '40001', message = 'FORMULATION_VERSION_CONFLICT'; end if;
  select metadata into v_metadata from storage.objects where bucket_id = 'product-images' and name = p_storage_path;
  if not found then raise exception using errcode = 'P0002', message = 'STORAGE_OBJECT_NOT_FOUND'; end if;
  v_object_size := nullif(v_metadata->>'size','')::bigint;
  v_object_type := v_metadata->>'mimetype';
  if v_object_size is distinct from p_size_bytes or v_object_type is distinct from p_content_type then
    raise exception using errcode = '22023', message = 'STORAGE_METADATA_MISMATCH';
  end if;
  update public.recipes set image_url = p_storage_path, version = version + 1, updated_at = now()
    where id = p_formulation_id and shop_id = p_shop_id returning * into v_recipe;
  return jsonb_build_object('storage_path', p_storage_path, 'version', v_recipe.version);
end;
$$;
revoke all on function public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint) from public, anon;
grant execute on function public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
