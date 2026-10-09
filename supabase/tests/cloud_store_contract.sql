begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

select has_table('public', 'shops', 'shops table exists');
select has_table('public', 'shop_memberships', 'membership table exists');
select has_table('public', 'products', 'products table exists');
select has_table('public', 'product_barcodes', 'normalized barcode uniqueness table exists');
select has_table('public', 'invoices', 'invoices table exists');
select has_table('public', 'stock_movements', 'stock ledger exists');
select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'RLS is enabled for products');
select ok((select relforcerowsecurity from pg_class where oid = 'public.products'::regclass), 'RLS is forced for products');
select ok(not has_table_privilege('authenticated', 'public.products', 'SELECT'), 'authenticated clients cannot select raw product cost columns');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'seller_invoice_items' and column_name = 'unit_cost_snapshot'
), 'seller invoice view excludes unit cost');
select ok(to_regprocedure('public.create_invoice_with_stock(uuid,uuid,jsonb,text,text,text,text,text,numeric)') is not null, 'atomic invoice and stock RPC exists');
select ok(to_regprocedure('public.search_products_by_barcode(uuid,text)') is not null, 'limited exact barcode search RPC exists');
select ok(has_function_privilege('authenticated', 'public.search_products_by_barcode(uuid,text)', 'EXECUTE') and not has_function_privilege('anon', 'public.search_products_by_barcode(uuid,text)', 'EXECUTE'), 'barcode search is authenticated-only');
select ok(to_regprocedure('public.register_product_image(uuid,uuid,bigint,uuid,text,text,bigint)') is not null, 'product image registration RPC exists');
select ok(to_regprocedure('public.list_shop_members(uuid)') is not null, 'manager-only membership listing RPC exists');
select ok(to_regprocedure('public.set_shop_membership(uuid,uuid,public.shop_role,public.membership_status)') is not null, 'manager-only membership update RPC exists');
select ok(not has_table_privilege('authenticated', 'public.shop_memberships', 'UPDATE'), 'clients cannot update membership roles directly');
select ok((select not public from storage.buckets where id = 'product-images'), 'product image bucket is private');

select * from finish();
rollback;
