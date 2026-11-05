begin;

alter table public.catalog_orders
  add column if not exists address text,
  add column if not exists note text;

alter table public.catalog_orders enable row level security;
alter table public.catalog_orders force row level security;

revoke all on public.catalog_orders from public, anon;
grant insert on public.catalog_orders to anon, authenticated;
grant select, update, delete on public.catalog_orders to authenticated;

drop policy if exists catalog_orders_public_insert on public.catalog_orders;
create policy catalog_orders_public_insert
  on public.catalog_orders
  for insert
  to anon, authenticated
  with check (
    length(trim(coalesce(customer_name, ''))) between 2 and 180
    and length(trim(coalesce(customer_phone, ''))) between 7 and 40
    and jsonb_typeof(items) = 'array'
    and total_amount >= 0
  );

notify pgrst, 'reload schema';
commit;
