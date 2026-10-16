begin;

alter table public.store_offers add column if not exists banner_title text;
alter table public.store_offers add column if not exists description text not null default '';
alter table public.store_offers add column if not exists strategy text not null default '';
alter table public.store_offers add column if not exists original_price numeric(14,2);
alter table public.store_offers add column if not exists offer_price numeric(14,2);
alter table public.store_offers add column if not exists start_date text;
alter table public.store_offers add column if not exists expires_at timestamptz;
alter table public.store_offers add column if not exists points_reward integer not null default 0 check (points_reward >= 0);

create table if not exists public.customer_points (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  customer_phone text not null,
  customer_name text,
  points integer not null default 0,
  total_spent numeric(14,2) not null default 0,
  last_transaction_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_points_store_id_uuid check (store_id::uuid is not null),
  constraint customer_points_points_nonnegative check (points >= 0),
  constraint customer_points_total_spent_nonnegative check (total_spent >= 0)
);
create unique index if not exists customer_points_store_phone_idx on public.customer_points(store_id, customer_phone);
create index if not exists customer_points_store_updated_idx on public.customer_points(store_id, updated_at desc);

alter table public.customer_points enable row level security;
alter table public.customer_points force row level security;
drop policy if exists customer_points_manager_read on public.customer_points;
drop policy if exists customer_points_manager_insert on public.customer_points;
drop policy if exists customer_points_manager_update on public.customer_points;
drop policy if exists customer_points_manager_delete on public.customer_points;
create policy customer_points_manager_read on public.customer_points for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy customer_points_manager_insert on public.customer_points for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy customer_points_manager_update on public.customer_points for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy customer_points_manager_delete on public.customer_points for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

create or replace function public.customer_points_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists customer_points_touch_updated_at on public.customer_points;
create trigger customer_points_touch_updated_at before update on public.customer_points for each row execute function public.customer_points_touch_updated_at();

revoke all on public.customer_points from public, anon;
grant select, insert, update, delete on public.customer_points to authenticated;
alter table public.customer_points replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'customer_points') then
    alter publication supabase_realtime add table public.customer_points;
  end if;
end;
$$;

commit;
