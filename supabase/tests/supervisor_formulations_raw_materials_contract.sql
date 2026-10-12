begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='SELECT' and qual ilike '%is_shop_member%'
), 'shop members including supervisors can read raw materials');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='INSERT' and with_check ilike '%supervisor%'
), 'supervisors can insert raw materials in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='UPDATE' and qual ilike '%supervisor%' and with_check ilike '%supervisor%'
), 'supervisors can update raw materials in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='raw_materials'
    and cmd='DELETE' and qual ilike '%supervisor%'
), 'supervisors can delete raw materials in their shop');

select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='SELECT' and qual ilike '%supervisor%'
), 'supervisors can read formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='INSERT' and with_check ilike '%supervisor%'
), 'supervisors can insert formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='UPDATE' and qual ilike '%supervisor%' and with_check ilike '%supervisor%'
), 'supervisors can update formulations in their shop');
select ok(exists (
  select 1 from pg_policies where schemaname='public' and tablename='recipes'
    and cmd='DELETE' and qual ilike '%supervisor%'
), 'supervisors can delete formulations in their shop');

select * from finish();
rollback;
