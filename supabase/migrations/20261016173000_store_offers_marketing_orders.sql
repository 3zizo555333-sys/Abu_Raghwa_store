begin;

create table if not exists public.store_offers (
  id text primary key check (length(trim(id)) between 1 and 64),
  store_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  public_description text not null default '',
  offer_data jsonb not null check (jsonb_typeof(offer_data) = 'object'),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('draft','active','paused','expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists store_offers_store_status_idx on public.store_offers(store_id, status, starts_at, ends_at) where deleted_at is null;

create table if not exists public.offer_orders (
  id text primary key check (length(trim(id)) between 6 and 96),
  store_id uuid not null references public.shops(id) on delete cascade,
  offer_id text not null references public.store_offers(id) on delete cascade,
  offer_title text not null,
  customer_name text not null,
  customer_code text not null,
  customer_phone text,
  points_cost integer not null default 0 check (points_cost >= 0),
  status text not null default 'pending' check (status in ('pending','approved','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offer_orders_store_status_idx on public.offer_orders(store_id, status, created_at desc);

alter table public.store_offers enable row level security;
alter table public.store_offers force row level security;
alter table public.offer_orders enable row level security;
alter table public.offer_orders force row level security;
revoke all on public.store_offers, public.offer_orders from public, anon;
grant select on public.store_offers to anon, authenticated;
grant insert, update, delete on public.store_offers to authenticated;
grant insert on public.offer_orders to anon, authenticated;
grant select, update on public.offer_orders to authenticated;

create policy store_offers_public_active_read on public.store_offers for select to anon, authenticated
  using (status = 'active' and deleted_at is null and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy store_offers_manager_read on public.store_offers for select to authenticated
  using (public.has_shop_role(store_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy store_offers_manager_insert on public.store_offers for insert to authenticated
  with check (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]));
create policy store_offers_manager_update on public.store_offers for update to authenticated
  using (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]));
create policy store_offers_manager_delete on public.store_offers for delete to authenticated
  using (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]));

create policy offer_orders_public_insert on public.offer_orders for insert to anon, authenticated
  with check (
    customer_code ~ '^[A-Za-z0-9_-]{4,48}$'
    and exists (select 1 from public.store_offers o where o.id = offer_id and o.store_id = store_id and o.status = 'active' and o.deleted_at is null and (o.starts_at is null or o.starts_at <= now()) and (o.ends_at is null or o.ends_at > now()))
  );
create policy offer_orders_manager_read on public.offer_orders for select to authenticated
  using (public.has_shop_role(store_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy offer_orders_manager_update on public.offer_orders for update to authenticated
  using (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id, array['manager','admin']::public.shop_role[]));

create trigger store_offers_touch_updated_at before update on public.store_offers for each row execute function public.touch_updated_at();
create trigger offer_orders_touch_updated_at before update on public.offer_orders for each row execute function public.touch_updated_at();
create trigger store_offers_emit_event after insert or update or delete on public.store_offers for each row execute function public.emit_shop_change_event();

alter table public.store_offers replica identity full;
alter table public.offer_orders replica identity full;
do $$ begin
  if exists(select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_offers') then execute 'alter publication supabase_realtime add table public.store_offers'; end if;
    if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'offer_orders') then execute 'alter publication supabase_realtime add table public.offer_orders'; end if;
  end if;
end $$;

commit;
