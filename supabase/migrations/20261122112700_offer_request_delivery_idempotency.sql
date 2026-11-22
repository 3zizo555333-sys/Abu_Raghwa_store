begin;

alter table public.catalog_orders
  add column if not exists delivery_address text;

-- A contacted request is still active and must not be duplicated.
drop index if exists public.catalog_orders_offer_pending_customer_uidx;
create unique index catalog_orders_offer_pending_customer_uidx
  on public.catalog_orders(shop_id, offer_id, customer_code)
  where order_type = 'offer' and status in ('pending', 'contacted');

notify pgrst, 'reload schema';
commit;
