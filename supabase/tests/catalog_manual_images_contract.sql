begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_column('public', 'catalog_manual_products', 'catalog_image_url', 'manual catalog products store a stable public image URL');
select has_column('public', 'catalog_manual_products', 'catalog_image_storage_path', 'manual catalog products store their tenant-scoped object path');
select ok(
  exists (select 1 from storage.buckets where id = 'catalog-product-images' and public and file_size_limit = 300000 and allowed_mime_types @> array['image/webp','image/jpeg']::text[]),
  'catalog images are public display assets with WebP/JPEG types and a sub-300KB bucket limit'
);
select ok(to_regprocedure('public.catalog_manual_image_upload_allowed(text)') is not null, 'catalog upload authorization helper exists');
select ok(
  pg_get_functiondef('public.catalog_manual_image_upload_allowed(text)'::regprocedure) ilike '%manager%' and
  pg_get_functiondef('public.catalog_manual_image_upload_allowed(text)'::regprocedure) ilike '%admin%' and
  pg_get_functiondef('public.catalog_manual_image_upload_allowed(text)'::regprocedure) not ilike '%supervisor%',
  'only managers/admins may upload catalog images'
);
select ok(
  exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='catalog_manual_images_storage_insert' and with_check ilike '%catalog_manual_image_upload_allowed%' and with_check ilike '%300000%'),
  'storage insert policy scopes uploads to an authorized shop/product and size bound'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.catalog_manual_products'::regclass and conname='catalog_manual_image_path_matches_row'),
  'stored object path must match both its shop and product row'
);

select * from finish();
rollback;
