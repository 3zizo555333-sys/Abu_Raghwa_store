begin;

-- Formulation uploads may use JPEG only when the browser cannot encode WebP.
-- Keep the existing private bucket, 5 MiB ceiling, shop-role checks and object
-- registration/version checks unchanged.
create or replace function public.formulation_image_shop_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/formulations/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webp|jpg|jpeg)$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;

drop policy if exists formulation_image_manager_insert on storage.objects;
create policy formulation_image_manager_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(public.formulation_image_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' in ('image/webp','image/jpeg')
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
    and metadata->>'mimetype' in ('image/webp','image/jpeg')
  );

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
  if p_content_type not in ('image/webp','image/jpeg') or p_size_bytes < 1 or p_size_bytes > 5242880 then
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

notify pgrst, 'reload schema';
commit;
