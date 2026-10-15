begin;

-- Dedicated public bucket for compressed formula images. Keep the existing
-- shared product-images bucket private for products and apartment inventory.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('formulas', 'formulas', true, 299999, array['image/webp', 'image/jpeg'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- The requested public/authenticated upload and update policies are constrained
-- to compressed WebP/JPEG payloads strictly smaller than 300 KB.
drop policy if exists "Allow public/auth upload" on storage.objects;
create policy "Allow public/auth upload" on storage.objects
  for insert to public
  with check (bucket_id = 'formulas');

drop policy if exists "Allow public read" on storage.objects;
create policy "Allow public read" on storage.objects
  for select to public
  using (bucket_id = 'formulas');

drop policy if exists "Allow public/auth update" on storage.objects;
create policy "Allow public/auth update" on storage.objects
  for update to public
  using (bucket_id = 'formulas')
  with check (bucket_id = 'formulas');

-- Public uploads are not allowed to delete objects; shop staff can clean up
-- replaced formula images only inside their own shop path.
drop policy if exists formulas_image_manager_delete on storage.objects;
create policy formulas_image_manager_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'formulas'
    and public.formulation_image_shop_from_path(name) is not null
    and public.has_shop_role(
      public.formulation_image_shop_from_path(name),
      array['manager', 'admin', 'supervisor']::public.shop_role[]
    )
  );

create or replace function public.register_public_formulation_image(
  p_shop_id uuid,
  p_formulation_id uuid,
  p_expected_version bigint,
  p_image_id uuid,
  p_storage_path text,
  p_public_url text,
  p_content_type text,
  p_size_bytes bigint
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_recipe public.recipes;
  v_metadata jsonb;
  v_object_size bigint;
  v_object_type text;
  v_public_suffix text := '/storage/v1/object/public/formulas/' || p_storage_path;
begin
  if not public.has_shop_role(p_shop_id, array['manager', 'admin', 'supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FORMULATION_IMAGE_FORBIDDEN';
  end if;
  if p_content_type not in ('image/webp', 'image/jpeg') or p_size_bytes < 1 or p_size_bytes >= 300000 then
    raise exception using errcode = '22023', message = 'INVALID_FORMULATION_IMAGE';
  end if;
  if public.formulation_image_shop_from_path(p_storage_path) is distinct from p_shop_id
     or split_part(p_storage_path, '/', 3)::uuid is distinct from p_formulation_id
     or split_part(split_part(p_storage_path, '/', 4), '.', 1)::uuid is distinct from p_image_id then
    raise exception using errcode = '22023', message = 'INVALID_FORMULATION_IMAGE_PATH';
  end if;
  if p_public_url is null or right(p_public_url, length(v_public_suffix)) <> v_public_suffix then
    raise exception using errcode = '22023', message = 'INVALID_FORMULATION_PUBLIC_URL';
  end if;

  select * into v_recipe from public.recipes
   where id = p_formulation_id and shop_id = p_shop_id and deleted_at is null
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'FORMULATION_NOT_FOUND';
  end if;
  if v_recipe.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'FORMULATION_VERSION_CONFLICT';
  end if;

  select metadata into v_metadata from storage.objects
   where bucket_id = 'formulas' and name = p_storage_path;
  if not found then
    raise exception using errcode = 'P0002', message = 'STORAGE_OBJECT_NOT_FOUND';
  end if;
  v_object_size := nullif(v_metadata->>'size', '')::bigint;
  v_object_type := v_metadata->>'mimetype';
  if v_object_size is distinct from p_size_bytes or v_object_type is distinct from p_content_type
     or v_object_size >= 300000 then
    raise exception using errcode = '22023', message = 'STORAGE_METADATA_MISMATCH';
  end if;

  update public.recipes
     set image_url = p_public_url, version = version + 1, updated_at = now()
   where id = p_formulation_id and shop_id = p_shop_id
   returning * into v_recipe;
  return jsonb_build_object(
    'storage_path', p_storage_path,
    'public_url', p_public_url,
    'version', v_recipe.version
  );
end;
$$;
revoke all on function public.register_public_formulation_image(uuid, uuid, bigint, uuid, text, text, text, bigint) from public, anon;
grant execute on function public.register_public_formulation_image(uuid, uuid, bigint, uuid, text, text, text, bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
