begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select ok((select relrowsecurity from pg_class where oid='public.invoice_intents'::regclass), 'invoice intents retain RLS');
select ok((select relforcerowsecurity from pg_class where oid='public.invoice_intents'::regclass), 'invoice intents retain forced RLS');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_intents' and policyname='invoice_intents_actor_read' and cmd='SELECT' and qual ilike '%actor_id%' and qual ilike '%is_shop_member%'), 'cashiers can read only their own shop-scoped intent when granted table access');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='invoice_intents' and policyname='invoice_intents_direct_write_block' and cmd='ALL' and qual='false' and with_check='false'), 'direct invoice intent mutations are explicitly denied');
select ok(not has_table_privilege('authenticated','public.invoice_intents','SELECT') and not has_table_privilege('authenticated','public.invoice_intents','INSERT') and not has_table_privilege('authenticated','public.invoice_intents','UPDATE') and not has_table_privilege('authenticated','public.invoice_intents','DELETE'), 'invoice intent table grants remain revoked from clients');

select ok((select relrowsecurity from pg_class where oid='public.apartment_inventory_bulk_requests'::regclass), 'bulk request receipts retain RLS');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='apartment_inventory_bulk_requests' and policyname='apartment_inventory_bulk_requests_manager_read' and cmd='SELECT' and qual ilike '%has_shop_role%' and qual ilike '%shop_id%'), 'bulk receipts are scoped to authorized shop managers');
select ok(exists (select 1 from pg_policies where schemaname='public' and tablename='apartment_inventory_bulk_requests' and policyname='apartment_inventory_bulk_requests_direct_write_block' and cmd='ALL' and qual='false' and with_check='false'), 'direct bulk receipt mutations are explicitly denied');
select ok(not has_table_privilege('authenticated','public.apartment_inventory_bulk_requests','SELECT') and not has_table_privilege('authenticated','public.apartment_inventory_bulk_requests','INSERT') and not has_table_privilege('authenticated','public.apartment_inventory_bulk_requests','UPDATE') and not has_table_privilege('authenticated','public.apartment_inventory_bulk_requests','DELETE'), 'bulk receipt table grants remain revoked from clients');

select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('authenticated',p.oid,'EXECUTE')
    and not (coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']::text[])
), 'authenticated-callable SECURITY DEFINER functions keep an empty search_path');
select ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prosecdef
    and has_function_privilege('anon',p.oid,'EXECUTE')
), 'SECURITY DEFINER functions are not executable by anon');
select ok(to_regprocedure('public.complete_invoice_intent(uuid,uuid)') is not null and to_regprocedure('public.create_apartment_inventory_items_bulk(uuid,uuid,jsonb)') is not null, 'atomic checkout and bulk RPCs remain available');

select * from finish();
rollback;
