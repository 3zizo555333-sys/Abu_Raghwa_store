begin;
select plan(7);
select has_column('public', 'invoice_items', 'formulation_id', 'invoice items can record a sold formulation separately from product stock');
select has_view('public', 'pos_formulations', 'the safe point-of-sale formulation catalog exists');
select ok(has_table_privilege('authenticated', 'public.pos_formulations', 'SELECT'), 'authenticated shop staff can read the safe formulation catalog');
select ok(not has_table_privilege('anon', 'public.pos_formulations', 'SELECT'), 'anonymous users cannot read the shop formulation catalog');
select ok(not exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'pos_formulations'
    and column_name in ('cost_price', 'password_hash', 'notes', 'description')
), 'the POS view does not expose formula costs, password hashes or notes');
select ok(position('formulation_id' in pg_get_functiondef('public.create_invoice_with_stock(uuid,uuid,jsonb,text,text,text,text,text,numeric)'::regprocedure)) > 0, 'atomic invoice RPC explicitly handles formulation references');
select ok(position('formula_points' in pg_get_functiondef('public.apply_invoice_loyalty(uuid,uuid,text,text)'::regprocedure)) > 0, 'invoice loyalty RPC supports formulation points');
select * from finish();
rollback;
