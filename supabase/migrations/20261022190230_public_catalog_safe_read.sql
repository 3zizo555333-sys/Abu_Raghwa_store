begin;

-- Registered public products: expose only catalog-safe columns to anon.
drop policy if exists products_public_catalog_read on public.products;
create policy products_public_catalog_read
  on public.products for select to anon, authenticated
  using (catalog_visible = true and deleted_at is null);

grant select (
  id, shop_id, name, unit_name, retail_price, category_name, loyalty_points,
  catalog_image_path, catalog_visible, catalog_price, catalog_old_price,
  catalog_description, catalog_details_url, catalog_category, catalog_company,
  catalog_loyalty_points, deleted_at
) on public.products to anon;

-- Public taxonomy contains only names and sort metadata.
drop policy if exists catalog_categories_public_read on public.catalog_categories;
create policy catalog_categories_public_read
  on public.catalog_categories for select to anon, authenticated
  using (deleted_at is null);
grant select on public.catalog_categories to anon;

drop policy if exists catalog_companies_public_read on public.catalog_companies;
create policy catalog_companies_public_read
  on public.catalog_companies for select to anon, authenticated
  using (deleted_at is null);
grant select on public.catalog_companies to anon;

-- Other public-catalog sources are read using explicit safe projections by the client.
drop policy if exists catalog_manual_products_public_read on public.catalog_manual_products;
create policy catalog_manual_products_public_read
  on public.catalog_manual_products for select to anon, authenticated
  using (is_visible = true and deleted_at is null);
grant select (
  id, shop_id, name, unit, price, description, details_url, loyalty_points,
  is_visible, catalog_image_url, catalog_image_storage_path, deleted_at
) on public.catalog_manual_products to anon;

drop policy if exists recipes_public_catalog_read on public.recipes;
create policy recipes_public_catalog_read
  on public.recipes for select to anon, authenticated
  using (catalog_visible = true and deleted_at is null);
grant select (
  id, shop_id, name, retail_price, production_unit, loyalty_points, image_url,
  catalog_visible, catalog_price, catalog_old_price, catalog_description,
  catalog_details_url, catalog_category, catalog_company, version, deleted_at
) on public.recipes to anon;

-- Only the public delivery-pricing setting may be read without membership.
drop policy if exists catalog_settings_public_pricing_read on public.catalog_settings;
create policy catalog_settings_public_pricing_read
  on public.catalog_settings for select to anon, authenticated
  using (setting_key = 'pricing');
grant select (shop_id, setting_key, value) on public.catalog_settings to anon;

-- Expose reward labels/thresholds, never their internal cost.
drop policy if exists loyalty_rewards_public_catalog_read on public.loyalty_rewards;
create policy loyalty_rewards_public_catalog_read
  on public.loyalty_rewards for select to anon, authenticated
  using (is_active = true and deleted_at is null);
grant select (shop_id, gift_name, points_required, is_active, deleted_at)
  on public.loyalty_rewards to anon;

notify pgrst, 'reload schema';
commit;
