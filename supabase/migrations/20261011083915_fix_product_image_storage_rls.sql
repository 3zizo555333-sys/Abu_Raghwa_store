begin;

-- The private bucket already enforces the 5 MiB limit and accepted MIME types.
-- The image-registration RPC validates object metadata after upload, so the
-- INSERT policy must not depend on metadata fields that Storage may omit while
-- evaluating the initial object INSERT.
drop policy if exists product_image_manager_insert on storage.objects;
create policy product_image_manager_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_shop_role(
      public.shop_id_from_storage_path(name),
      array['manager','admin','supervisor']::public.shop_role[]
    )
  );

commit;
