begin;

alter table public.catalog_orders
  add column if not exists order_type text not null default 'catalog' check (order_type in ('catalog', 'offer')),
  add column if not exists offer_id text references public.store_offers(id) on delete set null,
  add column if not exists offer_title text,
  add column if not exists customer_code text,
  add column if not exists delivery_address text,
  add column if not exists loyalty_points integer not null default 0 check (loyalty_points >= 0),
  add column if not exists loyalty_points_awarded integer not null default 0 check (loyalty_points_awarded >= 0),
  add column if not exists offer_snapshot jsonb not null default '{}'::jsonb;

create index if not exists catalog_orders_type_status_created_idx
  on public.catalog_orders(order_type, status, created_at desc);
create index if not exists catalog_orders_offer_customer_idx
  on public.catalog_orders(offer_id, customer_code, created_at desc)
  where order_type = 'offer';
create unique index if not exists catalog_orders_offer_pending_customer_uidx
  on public.catalog_orders(shop_id, offer_id, customer_code)
  where order_type = 'offer' and status in ('pending', 'contacted');

-- Orders include customer names, phone numbers and addresses; they must never be publicly readable.
drop policy if exists "Allow read catalog_orders" on public.catalog_orders;

notify pgrst, 'reload schema';
commit;
