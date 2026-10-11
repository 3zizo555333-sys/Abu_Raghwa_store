begin;

-- SELECT-only repair. No product rows are inserted, updated, deleted, or reset.
-- In this schema shop_id is the canonical store_id.

-- Keep an explicit owner/manager/admin + supervisor read policy for products.
drop policy if exists products_owner_supervisor_select on public.products;
create policy products_owner_supervisor_select on public.products
  for select to authenticated
  using (
    public.has_shop_role(
      shop_id,
      array['manager','admin','supervisor']::public.shop_role[]
    )
    and deleted_at is null
  );

-- The product creation flow also normalizes barcodes in product_barcodes.
-- Add the missing SELECT policy so a post-insert select/refresh can read them.
drop policy if exists product_barcodes_owner_supervisor_select on public.product_barcodes;
create policy product_barcodes_owner_supervisor_select on public.product_barcodes
  for select to authenticated
  using (
    public.has_shop_role(
      shop_id,
      array['manager','admin','supervisor']::public.shop_role[]
    )
  );

grant select on public.products, public.product_barcodes to authenticated;

commit;
