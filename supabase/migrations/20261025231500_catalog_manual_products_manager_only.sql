begin;

-- Manual catalog visibility and deletion are manager/admin operations.
drop policy if exists catalog_manual_products_manager_update on public.catalog_manual_products;
create policy catalog_manual_products_manager_update
  on public.catalog_manual_products for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists catalog_manual_products_manager_delete on public.catalog_manual_products;
create policy catalog_manual_products_manager_delete
  on public.catalog_manual_products for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

commit;
