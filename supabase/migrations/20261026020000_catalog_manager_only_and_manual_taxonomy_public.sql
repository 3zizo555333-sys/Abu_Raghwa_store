begin;

-- Catalog taxonomy and manual catalog content are manager/admin operations.
-- Public customers keep read-only access through the existing safe policies.
drop policy if exists catalog_categories_manager_insert on public.catalog_categories;
create policy catalog_categories_manager_insert
  on public.catalog_categories for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists catalog_categories_manager_update on public.catalog_categories;
create policy catalog_categories_manager_update
  on public.catalog_categories for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists catalog_companies_manager_insert on public.catalog_companies;
create policy catalog_companies_manager_insert
  on public.catalog_companies for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists catalog_companies_manager_update on public.catalog_companies;
create policy catalog_companies_manager_update
  on public.catalog_companies for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists catalog_manual_products_manager_insert on public.catalog_manual_products;
create policy catalog_manual_products_manager_insert
  on public.catalog_manual_products for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

-- These foreign-key identifiers are safe display metadata and let the public
-- projection resolve manual products to the existing taxonomy names. No cost,
-- inventory, customer, or internal columns are exposed.
grant select (
  id, shop_id, category_id, company_id, name, unit, price, description,
  details_url, loyalty_points, is_visible, catalog_image_url,
  catalog_image_storage_path, deleted_at
) on public.catalog_manual_products to anon;

notify pgrst, 'reload schema';
commit;
