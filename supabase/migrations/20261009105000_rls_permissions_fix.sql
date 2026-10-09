begin;

-- Permission repair for the cloud migration. Access is limited to authenticated
-- users who are active members of the row's shop; no anonymous/public access.

grant usage on schema public to authenticated;

grant select on public.products, public.product_categories, public.product_images to authenticated;
grant insert, update, delete on public.products, public.product_categories, public.product_images to authenticated;

grant select, insert, update, delete on public.staff_employees, public.staff_attendance, public.staff_withdrawals,
  public.raw_materials, public.production_runs, public.catalog_settings, public.catalog_categories,
  public.catalog_companies, public.catalog_manual_products to authenticated;
grant select, insert, update, delete on public.recipes, public.recipe_ingredients, public.loyalty_customers,
  public.loyalty_rewards, public.loyalty_redemptions, public.catalog_orders to authenticated;

drop policy if exists products_member_read on public.products;
drop policy if exists products_manager_insert on public.products;
drop policy if exists products_manager_update on public.products;
drop policy if exists products_manager_delete on public.products;
create policy products_member_read on public.products for select to authenticated
  using (public.is_shop_member(shop_id) and deleted_at is null);
create policy products_manager_insert on public.products for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy products_manager_update on public.products for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy products_manager_delete on public.products for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists categories_manager_insert on public.product_categories;
drop policy if exists categories_manager_update on public.product_categories;
drop policy if exists categories_manager_delete on public.product_categories;
create policy categories_manager_insert on public.product_categories for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy categories_manager_update on public.product_categories for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy categories_manager_delete on public.product_categories for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists images_manager_insert on public.product_images;
drop policy if exists images_manager_update on public.product_images;
drop policy if exists images_manager_delete on public.product_images;
create policy images_manager_insert on public.product_images for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy images_manager_update on public.product_images for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy images_manager_delete on public.product_images for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

-- The previous batch intentionally omitted DELETE policies. Recreate complete
-- CRUD policies for the operational staff/material/catalog tables.
do $$
declare v_table text;
begin
  foreach v_table in array array['staff_employees','staff_attendance','staff_withdrawals','raw_materials','production_runs','catalog_settings','catalog_categories','catalog_companies','catalog_manual_products'] loop
    execute format('drop policy if exists %I_member_read on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_manager_insert on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_manager_update on public.%I', v_table, v_table);
    execute format('drop policy if exists %I_manager_delete on public.%I', v_table, v_table);
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_shop_member(shop_id))', v_table, v_table);
    execute format('create policy %I_manager_insert on public.%I for insert to authenticated with check (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[]))', v_table, v_table);
    execute format('create policy %I_manager_update on public.%I for update to authenticated using (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[])) with check (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[]))', v_table, v_table);
    execute format('create policy %I_manager_delete on public.%I for delete to authenticated using (public.has_shop_role(shop_id, array[''manager'',''admin'']::public.shop_role[]))', v_table, v_table);
  end loop;
end;
$$;

-- Recipes and loyalty/catalog records are manager-controlled. Add missing DELETE
-- policies while preserving shop isolation and the existing deleted_at filters.
do $$
declare v_table text;
begin
  foreach v_table in array array['recipes','recipe_ingredients','loyalty_customers','loyalty_rewards','loyalty_redemptions','catalog_orders'] loop
    execute format('drop policy if exists %I_manager_delete on public.%I', v_table, v_table);
    execute format('create policy %I_manager_delete on public.%I for delete to authenticated using (public.has_shop_role(shop_id, array[''manager'',''admin'']::public.shop_role[]))', v_table, v_table);
  end loop;
end;
$$;

-- Realtime remains enabled for the operational tables after the policy repair.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['products','product_categories','product_images','staff_employees','staff_attendance','staff_withdrawals','raw_materials','production_runs','catalog_settings','catalog_categories','catalog_companies','catalog_manual_products','recipes','recipe_ingredients','loyalty_customers','loyalty_rewards','loyalty_redemptions','catalog_orders'] loop
      if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
