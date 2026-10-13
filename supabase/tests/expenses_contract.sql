begin;
select plan(16);

select ok(
  (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.expenses'::regclass),
  'expenses enforces row-level security'
);
select ok(
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='expense_type') and
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='notes') and
  exists (select 1 from information_schema.columns where table_schema='public' and table_name='expenses' and column_name='version'),
  'expense sync columns required by the UI are present'
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
select ok(has_function_privilege('authenticated', 'public.get_expense_summary(text)', 'EXECUTE'), 'authenticated managers can read protected financial aggregates');
select ok(
  exists (select 1 from pg_trigger where tgrelid = 'public.expenses'::regclass and tgname = 'expenses_emit_event' and not tgisinternal),
  'expense changes publish a shop-scoped Realtime event'
);
select ok(to_regprocedure('public.get_expense_summary(text)') is not null, 'summary RPC uses the required text shop identifier');
select ok(to_regprocedure('public.get_expense_summary(uuid)') is null, 'summary RPC has no ambiguous UUID overload');
select ok(has_function_privilege('anon', 'public.get_expense_summary(text)', 'EXECUTE'), 'anonymous role has the requested function grant');
select ok(
  pg_get_functiondef('public.get_expense_summary(text)'::regprocedure) ilike '%auth.uid()%' and
  pg_get_functiondef('public.get_expense_summary(text)'::regprocedure) ilike '%has_shop_role%',
  'the granted summary RPC still rejects anonymous and non-member callers'
);
select ok(
  pg_get_functiondef('public.get_expense_summary(text)'::regprocedure) ilike '%total_expenses%' and
  pg_get_functiondef('public.get_expense_summary(text)'::regprocedure) ilike '%net_profit%',
  'summary RPC returns expense totals and net profit'
);
select ok(
  pg_get_functiondef('public.save_expense(uuid,uuid,integer,jsonb)'::regprocedure) ilike '%manager%' and
  pg_get_functiondef('public.save_expense(uuid,uuid,integer,jsonb)'::regprocedure) not ilike '%supervisor%' and
  pg_get_functiondef('public.delete_expense(uuid,uuid,integer)'::regprocedure) not ilike '%supervisor%',
  'expense mutations remain limited to manager roles'
);

select * from finish();
rollback;
