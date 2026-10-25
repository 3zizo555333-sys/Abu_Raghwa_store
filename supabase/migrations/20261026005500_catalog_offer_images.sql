begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-images', 'catalog-images', true, 300000, array['image/webp','image/jpeg']::text[])
on conflict (id) do update set public = true, file_size_limit = 300000, allowed_mime_types = array['image/webp','image/jpeg']::text[];

create or replace function public.catalog_offer_image_upload_allowed(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select p_name ~ '^[0-9a-fA-F-]{36}/offers/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webp|jpg)$'
    and public.has_shop_role(split_part(p_name, '/', 1)::uuid, array['manager','admin']::public.shop_role[]);
$$;

revoke all on function public.catalog_offer_image_upload_allowed(text) from public, anon;
grant execute on function public.catalog_offer_image_upload_allowed(text) to authenticated;

create policy catalog_offer_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-images'
    and public.catalog_offer_image_upload_allowed(name)
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 299999
    and metadata->>'mimetype' in ('image/webp','image/jpeg'));

create policy catalog_offer_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-images' and public.catalog_offer_image_upload_allowed(name));

notify pgrst, 'reload schema';
commit;
