begin;

create table if not exists public.shortage_manual_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  store_id text generated always as (shop_id::text) stored,
  category_name text not null check (length(btrim(category_name)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 120),
  product_name text generated always as (name) stored,
  barcode text,
  quantity integer not null default 1 check (quantity >= 0),
  unit text not null default '' check (length(unit) <= 40),
  notes text not null default '',
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'ordered', 'received')),
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists shortage_manual_products_shop_category_name_idx
  on public.shortage_manual_products(shop_id, lower(category_name), lower(name)) where deleted_at is null;
create index if not exists shortage_manual_products_shop_idx
  on public.shortage_manual_products(shop_id, updated_at desc, id desc) where deleted_at is null;

alter table public.shortage_manual_products enable row level security;
alter table public.shortage_manual_products force row level security;
drop policy if exists shortage_manual_products_supervisor_read on public.shortage_manual_products;
drop policy if exists shortage_manual_products_supervisor_insert on public.shortage_manual_products;
drop policy if exists shortage_manual_products_supervisor_update on public.shortage_manual_products;
drop policy if exists shortage_manual_products_supervisor_delete on public.shortage_manual_products;
create policy shortage_manual_products_supervisor_read on public.shortage_manual_products for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_manual_products_supervisor_insert on public.shortage_manual_products for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_manual_products_supervisor_update on public.shortage_manual_products for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_manual_products_supervisor_delete on public.shortage_manual_products for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create or replace function public.shortage_manual_products_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;
drop trigger if exists shortage_manual_products_touch_updated_at on public.shortage_manual_products;
create trigger shortage_manual_products_touch_updated_at before update on public.shortage_manual_products for each row execute function public.shortage_manual_products_touch_updated_at();

revoke all on public.shortage_manual_products from public, anon, authenticated;
grant select, insert, update, delete on public.shortage_manual_products to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shortage_manual_products') then
    alter publication supabase_realtime add table public.shortage_manual_products;
  end if;
end;
$$;
alter table public.shortage_manual_products replica identity full;

commit;
