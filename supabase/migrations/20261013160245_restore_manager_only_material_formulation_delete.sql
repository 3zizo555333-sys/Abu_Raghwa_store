begin;

-- Supervisors retain shop-scoped SELECT/INSERT/UPDATE access. Destructive
-- deletion remains reserved for managers and admins.
drop policy if exists raw_materials_manager_delete on public.raw_materials;
create policy raw_materials_manager_delete on public.raw_materials
  for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists recipes_manager_delete on public.recipes;
create policy recipes_manager_delete on public.recipes
  for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

commit;
