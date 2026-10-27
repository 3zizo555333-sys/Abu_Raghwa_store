begin;

alter table public.store_offers
  add column if not exists qr_code_data text,
  add column if not exists promo_text text not null default '',
  add column if not exists image_url text,
  add column if not exists bg_color text not null default '#ea580c',
  add column if not exists bg_gradient text,
  add column if not exists banner_custom_image text;

insert into storage.buckets (id, name, public)
values ('catalog-images', 'catalog-images', true)
on conflict (id) do update set public = true;

drop policy if exists catalog_offer_images_storage_update on storage.objects;
create policy catalog_offer_images_storage_update
on storage.objects for update to authenticated
using (bucket_id = 'catalog-images' and public.catalog_offer_image_upload_allowed(name))
with check (
  bucket_id = 'catalog-images'
  and public.catalog_offer_image_upload_allowed(name)
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 299999
  and (metadata ->> 'mimetype') in ('image/webp', 'image/jpeg')
);

notify pgrst, 'reload schema';
commit;
