begin;
select plan(9);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.expenses'::regclass),
  'expenses enforces row-level security'
);
select ok(
  exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and policyname = 'expenses_manager_read' and cmd = 'SELECT'),
  'only manager, admin, and supervisor membership can read expenses'
);
select ok(
  not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'expenses' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')),
  'browser roles cannot bypass expense RPCs with direct table writes'
);
select ok(
  has_table_privilege('authenticated', 'public.expenses', 'SELECT')
    and not has_table_privilege('authenticated', 'public.expenses', 'INSERT')
    and not has_table_privilege('authenticated', 'public.expenses', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.expenses', 'DELETE'),
  'authenticated users have read-only table access'
);
select ok(has_function_privilege('authenticated', 'public.save_expense(uuid,uuid,integer,jsonb)', 'EXECUTE'), 'authorized roles can save expenses through the RPC');
select ok(not has_function_privilege('anon', 'public.save_expense(uuid,uuid,integer,jsonb)', 'EXECUTE'), 'anonymous users cannot save expenses');
select ok(has_function_privilege('authenticated', 'public.delete_expense(uuid,uuid,integer)', 'EXECUTE'), 'authorized roles can delete expenses through the RPC');
select ok(has_function_privilege('authenticated', 'public.get_expense_summary(uuid)', 'EXECUTE'), 'authorized roles can read protected financial aggregates');
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.expenses'::regclass and tgname = 'expenses_emit_event' and not tgisinternal),
  'expense changes publish a shop-scoped Realtime event'
);

select * from finish();
rollback;
