begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='SELECT' and qual ilike '%is_shop_member%' and qual ilike '%shop_id%'
), 'shop members including supervisors can read raw materials');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='INSERT' and with_check ilike '%supervisor%' and with_check ilike '%shop_id%'
), 'supervisors can insert raw materials in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='UPDATE' and qual ilike '%supervisor%' and qual ilike '%shop_id%'
    and with_check ilike '%supervisor%' and with_check ilike '%shop_id%'
), 'supervisors can update raw materials in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and policyname='raw_materials_manager_delete' and cmd='DELETE'
    and qual ilike '%manager%' and qual ilike '%admin%' and qual not ilike '%supervisor%'
), 'raw material deletion remains restricted to managers and admins');

select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='SELECT' and qual ilike '%supervisor%' and qual ilike '%shop_id%'
), 'supervisors can read formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='INSERT' and with_check ilike '%supervisor%' and with_check ilike '%shop_id%'
), 'supervisors can insert formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='UPDATE' and qual ilike '%supervisor%' and qual ilike '%shop_id%'
    and with_check ilike '%supervisor%' and with_check ilike '%shop_id%'
), 'supervisors can update formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and policyname='recipes_manager_delete' and cmd='DELETE'
    and qual ilike '%manager%' and qual ilike '%admin%' and qual not ilike '%supervisor%'
), 'formulation deletion remains restricted to managers and admins');

select * from finish();
rollback;
