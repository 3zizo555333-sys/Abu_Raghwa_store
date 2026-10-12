begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'apartment_inventory_images', 'private apartment inventory image metadata exists');
select ok(to_regclass('public.formulations') is not null, 'formulations compatibility view exists');
select ok(exists (select 1 from information_schema.columns where table_schema='public' and table_name='recipe_ingredients' and column_name='raw_material_id'), 'formulation ingredients reference raw materials');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.apartment_inventory_images'::regclass), 'image metadata has forced RLS');
select ok(not has_table_privilege('authenticated','public.apartment_inventory_bulk_requests','SELECT'), 'bulk idempotency receipts are inaccessible to clients');
select ok(not has_table_privilege('authenticated','public.apartment_inventory_images','INSERT'), 'clients cannot bypass image registration metadata checks');
select ok(to_regprocedure('public.create_apartment_inventory_items_bulk(uuid,uuid,jsonb)') is not null, 'atomic idempotent bulk insert RPC exists');
select ok(to_regprocedure('public.move_apartment_inventory_items_category(uuid,jsonb,text)') is not null, 'version-guarded category move RPC exists');
select ok(to_regprocedure('public.register_apartment_inventory_image(uuid,uuid,uuid,text,text,bigint)') is not null, 'apartment image registration RPC exists');
select ok(to_regprocedure('public.save_formulation_with_ingredients(uuid,uuid,bigint,jsonb,jsonb)') is not null, 'atomic formulation save RPC exists');
select is(public.apartment_inventory_shop_from_path('11111111-1111-4111-8111-111111111111/apartment-inventory/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp')::text, '11111111-1111-4111-8111-111111111111', 'apartment image path derives its own shop id');
select is(public.apartment_inventory_shop_from_path('11111111-1111-4111-8111-111111111111/products/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp'), null, 'apartment helper rejects product paths');
select ok(exists (select 1 from pg_constraint where conname='recipe_ingredients_raw_material_shop_fk' and conrelid='public.recipe_ingredients'::regclass), 'raw material foreign key is shop-scoped');
select ok(exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='apartment_inventory_image_manager_insert' and with_check like '%apartment_inventory_shop_from_path%'), 'image upload policy restricts writes to the scoped path');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='recipe_ingredients' and policyname='recipe_ingredients_manager_delete' and cmd='DELETE'), 'atomic formulation edits may replace ingredients for managers only');
select ok((select not public from storage.buckets where id='product-images'), 'the shared product-images bucket remains private');

select * from finish();
rollback;
