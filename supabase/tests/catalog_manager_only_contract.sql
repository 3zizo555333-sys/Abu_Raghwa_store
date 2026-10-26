begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'catalog_categories'
      and policyname = 'catalog_categories_manager_insert'
      and with_check ilike '%array[''manager'',''admin'']%'
      and with_check not ilike '%supervisor%'
  ),
  'category insert is limited to manager/admin'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'catalog_categories'
      and policyname = 'catalog_categories_manager_update'
      and qual ilike '%array[''manager'',''admin'']%'
      and with_check ilike '%array[''manager'',''admin'']%'
      and qual not ilike '%supervisor%'
      and with_check not ilike '%supervisor%'
  ),
  'category update is limited to manager/admin'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'catalog_companies'
      and policyname = 'catalog_companies_manager_update'
      and qual ilike '%array[''manager'',''admin'']%'
      and with_check ilike '%array[''manager'',''admin'']%'
      and qual not ilike '%supervisor%'
      and with_check not ilike '%supervisor%'
  ),
  'company update is limited to manager/admin'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'catalog_manual_products'
      and policyname = 'catalog_manual_products_manager_insert'
      and with_check ilike '%array[''manager'',''admin'']%'
      and with_check not ilike '%supervisor%'
  ),
  'manual product insert is limited to manager/admin'
);
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename in ('catalog_categories','catalog_companies','catalog_manual_products')
      and roles && array['anon']::name[]
      and cmd in ('INSERT','UPDATE','DELETE')
  ),
  'catalog tables have no anonymous write policy'
);
select ok(
  has_table_privilege('anon', 'public.catalog_manual_products', 'SELECT')
  and has_column_privilege('anon', 'public.catalog_manual_products', 'category_id', 'SELECT')
  and has_column_privilege('anon', 'public.catalog_manual_products', 'company_id', 'SELECT'),
  'public manual product projection can resolve taxonomy identifiers'
);

select * from finish();
rollback;
