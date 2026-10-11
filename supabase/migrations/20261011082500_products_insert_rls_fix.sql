begin;

-- RLS-only repair. This migration does not insert, update, delete, or reset data.
-- The application uses shop_id as the canonical store_id for the current shop.

-- Keep the product insert rule explicit for owners/managers/admins and supervisors
-- who have an active membership in the same shop_id supplied by the request.
drop policy if exists products_manager_insert on public.products;
drop policy if exists products_owner_supervisor_insert on public.products;
create policy products_owner_supervisor_insert on public.products
  for insert to authenticated
  with check (
    public.has_shop_role(
      shop_id,
      array['manager','admin','supervisor']::public.shop_role[]
    )
  );

-- create_product inserts normalized barcode rows in the same transaction. Because
-- product_barcodes is FORCE ROW LEVEL SECURITY, it needs its own explicit policy.
drop policy if exists product_barcodes_manager_insert on public.product_barcodes;
create policy product_barcodes_manager_insert on public.product_barcodes
  for insert to authenticated
  with check (
    public.has_shop_role(
      shop_id,
      array['manager','admin','supervisor']::public.shop_role[]
    )
  );

grant insert on public.products, public.product_barcodes to authenticated;
grant execute on function public.create_product(uuid, jsonb) to authenticated;

commit;
