begin;

alter table public.catalog_manual_products
  add column catalog_image_url text not null default '',
  add column catalog_image_storage_path text;

create or replace function public.catalog_image_shop_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/manual-products/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webp|jpg)$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function public.catalog_image_shop_from_path(text) from public, anon;
grant execute on function public.catalog_image_shop_from_path(text) to authenticated;

create or replace function public.catalog_manual_image_upload_allowed(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.catalog_image_shop_from_path(p_name) is not null
    and public.has_shop_role(public.catalog_image_shop_from_path(p_name), array['manager','admin']::public.shop_role[])
    and exists (
      select 1 from public.catalog_manual_products p
      where p.shop_id = public.catalog_image_shop_from_path(p_name)
        and p.id::text = split_part(p_name, '/', 3)
        and p.deleted_at is null
    );
$$;
revoke all on function public.catalog_manual_image_upload_allowed(text) from public, anon;
grant execute on function public.catalog_manual_image_upload_allowed(text) to authenticated;

alter table public.catalog_manual_products
  add constraint catalog_manual_image_path_matches_row check (
    catalog_image_storage_path is null or (
      public.catalog_image_shop_from_path(catalog_image_storage_path) = shop_id
      and split_part(catalog_image_storage_path, '/', 3) = id::text
    )
  );

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('catalog-product-images', 'catalog-product-images', true, 300000, array['image/webp','image/jpeg']::text[])
on conflict (id) do update set public = true, file_size_limit = 300000, allowed_mime_types = array['image/webp','image/jpeg']::text[];

create policy catalog_manual_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'catalog-product-images'
    and public.catalog_manual_image_upload_allowed(name)
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 299999
    and metadata->>'mimetype' in ('image/webp','image/jpeg'));
create policy catalog_manual_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'catalog-product-images'
    and public.catalog_manual_image_upload_allowed(name));

notify pgrst, 'reload schema';
commit;
