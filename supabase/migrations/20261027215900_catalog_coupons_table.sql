begin;

create table if not exists public.catalog_coupons (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  code text not null check (code = upper(btrim(code)) and code ~ '^[A-Z0-9_-]{3,40}$'),
  title text not null check (length(btrim(title)) > 0),
  description text not null default '',
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  min_order_amount numeric(12,2) not null default 0 check (min_order_amount >= 0),
  max_discount_amount numeric(12,2) check (max_discount_amount is null or max_discount_amount >= 0),
  valid_from timestamptz,
  valid_until timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, code)
);

alter table public.catalog_coupons enable row level security;
grant select on public.catalog_coupons to anon, authenticated;
grant insert, update, delete on public.catalog_coupons to authenticated;

create or replace function public.list_active_catalog_coupons(p_shop_id uuid)
returns setof public.catalog_coupons
language sql
stable
set search_path = ''
as $function$
  select c.*
  from public.catalog_coupons as c
  where c.shop_id = p_shop_id
    and c.is_active = true
    and (c.valid_from is null or c.valid_from <= pg_catalog.now())
    and (c.valid_until is null or c.valid_until > pg_catalog.now());
$function$;

commit;
