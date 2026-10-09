begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_table('public', 'invoice_intents', 'invoice intent ledger exists');
select ok((select relrowsecurity from pg_class where oid = 'public.invoice_intents'::regclass), 'RLS is enabled for invoice intents');
select ok((select relforcerowsecurity from pg_class where oid = 'public.invoice_intents'::regclass), 'RLS is forced for invoice intents');
select ok(not has_table_privilege('authenticated', 'public.invoice_intents', 'SELECT'), 'clients cannot read intents outside the owner-scoped RPC');
select ok(to_regclass('public.invoice_intents_one_open_per_actor_idx') is not null, 'only one open invoice intent per actor and shop is allowed');
select ok(to_regprocedure('public.create_invoice_intent(uuid,uuid,jsonb)') is not null, 'intent creation RPC exists');
select ok(to_regprocedure('public.get_recoverable_invoice_intent(uuid)') is not null, 'recovery RPC exists');
select ok(to_regprocedure('public.complete_invoice_intent(uuid,uuid)') is not null, 'atomic completion RPC exists');
select ok(to_regprocedure('public.acknowledge_invoice_intent(uuid,uuid)') is not null, 'acknowledgement RPC exists');
select ok(to_regprocedure('public.cancel_pending_invoice_intent(uuid,uuid)') is not null, 'pending cancellation RPC exists');
select ok(has_function_privilege('authenticated', 'public.create_invoice_intent(uuid,uuid,jsonb)', 'EXECUTE') and not has_function_privilege('anon', 'public.create_invoice_intent(uuid,uuid,jsonb)', 'EXECUTE'), 'intent creation is authenticated-only');
select ok(has_function_privilege('authenticated', 'public.get_recoverable_invoice_intent(uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.get_recoverable_invoice_intent(uuid)', 'EXECUTE'), 'recovery is authenticated-only');
select ok(has_function_privilege('authenticated', 'public.complete_invoice_intent(uuid,uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.complete_invoice_intent(uuid,uuid)', 'EXECUTE'), 'completion is authenticated-only');
select ok(has_function_privilege('authenticated', 'public.acknowledge_invoice_intent(uuid,uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.acknowledge_invoice_intent(uuid,uuid)', 'EXECUTE'), 'acknowledgement is authenticated-only');
select ok(has_function_privilege('authenticated', 'public.cancel_pending_invoice_intent(uuid,uuid)', 'EXECUTE') and not has_function_privilege('anon', 'public.cancel_pending_invoice_intent(uuid,uuid)', 'EXECUTE'), 'cancellation is authenticated-only');
select ok(not has_function_privilege('authenticated', 'public.create_invoice_with_stock(uuid,uuid,jsonb,text,text,text,text,text,numeric)', 'EXECUTE'), 'authenticated clients cannot bypass the recoverable intent flow');

select * from finish();
rollback;
