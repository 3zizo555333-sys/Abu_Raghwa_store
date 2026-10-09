begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

select ok(to_regprocedure('public.void_invoice(uuid,uuid)') is not null, 'invoice void RPC exists');
select ok(has_function_privilege('authenticated', 'public.void_invoice(uuid,uuid)', 'EXECUTE'), 'authenticated can call invoice void RPC');
select ok(not has_function_privilege('anon', 'public.void_invoice(uuid,uuid)', 'EXECUTE'), 'anonymous users cannot call invoice void RPC');
select ok(not has_table_privilege('authenticated', 'public.invoices', 'DELETE'), 'authenticated clients cannot delete invoices');
select ok(not has_table_privilege('authenticated', 'public.invoice_items', 'DELETE'), 'authenticated clients cannot delete invoice lines');
select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'DELETE'), 'authenticated clients cannot delete stock ledger rows');
select ok(position('idempotent_replay' in pg_get_functiondef('public.void_invoice(uuid,uuid)'::regprocedure)) > 0, 'void RPC declares its idempotent replay result');
select ok(position('stock_quantity_delta' in pg_get_functiondef('public.void_invoice(uuid,uuid)'::regprocedure)) > 0, 'void RPC restores the recorded stock delta');
select ok(position('delete from' in lower(pg_get_functiondef('public.void_invoice(uuid,uuid)'::regprocedure))) = 0, 'void RPC does not physically delete records');

select * from finish();
rollback;
