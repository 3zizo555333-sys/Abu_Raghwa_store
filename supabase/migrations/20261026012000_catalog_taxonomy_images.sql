begin;
alter table public.catalog_categories add column if not exists image_url text not null default '', add column if not exists image_storage_path text;
alter table public.catalog_companies add column if not exists image_url text not null default '', add column if not exists image_storage_path text;
create or replace function public.catalog_taxonomy_image_upload_allowed(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_name ~ '^[0-9a-fA-F-]{36}/(categories|companies)/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webp|jpg)$'
    and public.has_shop_role(split_part(p_name, '/', 1)::uuid, array['manager','admin']::public.shop_role[]);
$$;
revoke all on function public.catalog_taxonomy_image_upload_allowed(text) from public, anon;
grant execute on function public.catalog_taxonomy_image_upload_allowed(text) to authenticated;
create policy catalog_taxonomy_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-images' and public.catalog_taxonomy_image_upload_allowed(name)
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 299999
    and metadata->>'mimetype' in ('image/webp','image/jpeg'));
create policy catalog_taxonomy_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-images' and public.catalog_taxonomy_image_upload_allowed(name));
notify pgrst, 'reload schema';
commit;
