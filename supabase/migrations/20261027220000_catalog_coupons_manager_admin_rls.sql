begin;

-- Keep public coupon reads unchanged, while granting authenticated managers and
-- admins full access only to coupons belonging to shops where they are active.
alter table public.catalog_coupons enable row level security;
drop policy if exists catalog_coupons_manager_admin_all on public.catalog_coupons;
create policy catalog_coupons_manager_admin_all
  on public.catalog_coupons
  for all
  to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

notify pgrst, 'reload schema';
commit;
