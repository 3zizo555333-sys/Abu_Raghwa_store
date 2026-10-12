begin;

create table public.apartment_inventory_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint apartment_inventory_categories_shop_name_key unique (shop_id, name)
);

create index apartment_inventory_categories_shop_name_idx
  on public.apartment_inventory_categories (shop_id, name);

create table public.apartment_inventory_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id),
  name text not null check (length(btrim(name)) between 1 and 200),
  supplier text not null default '',
  location text not null default '',
  unit text not null default '',
  pieces_per_unit numeric(18,3) not null default 0 check (pieces_per_unit >= 0),
  quantity numeric(18,3) not null default 0 check (quantity >= 0),
  extra_pieces numeric(18,3) not null default 0 check (extra_pieces >= 0),
  wholesale_price numeric(18,2) not null default 0 check (wholesale_price >= 0),
  retail_price numeric(18,2) not null default 0 check (retail_price >= 0),
  wholesale_retail_price numeric(18,2) not null default 0 check (wholesale_retail_price >= 0),
  category_name text not null check (length(btrim(category_name)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index apartment_inventory_items_shop_created_idx
  on public.apartment_inventory_items (shop_id, created_at, id);
create index apartment_inventory_items_shop_category_idx
  on public.apartment_inventory_items (shop_id, category_name);

comment on table public.apartment_inventory_items is
  'Standalone apartment/warehouse inventory; intentionally separate from POS products and invoice stock movements.';
comment on column public.apartment_inventory_items.wholesale_price is
  'Purchase cost per stored package/unit; it is visible only to manager, admin, and supervisor roles.';

create trigger apartment_inventory_categories_touch_updated_at
  before update on public.apartment_inventory_categories
  for each row execute function public.touch_updated_at();
create trigger apartment_inventory_items_touch_updated_at
  before update on public.apartment_inventory_items
  for each row execute function public.touch_updated_at();

alter table public.apartment_inventory_categories enable row level security;
alter table public.apartment_inventory_categories force row level security;
alter table public.apartment_inventory_items enable row level security;
alter table public.apartment_inventory_items force row level security;

create policy apartment_inventory_categories_member_read
  on public.apartment_inventory_categories for select to authenticated
  using (public.is_shop_member(shop_id));
create policy apartment_inventory_categories_manager_insert
  on public.apartment_inventory_categories for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_categories_manager_update
  on public.apartment_inventory_categories for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_categories_manager_delete
  on public.apartment_inventory_categories for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

create policy apartment_inventory_items_member_read
  on public.apartment_inventory_items for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_items_manager_insert
  on public.apartment_inventory_items for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_items_manager_update
  on public.apartment_inventory_items for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_items_manager_delete
  on public.apartment_inventory_items for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

revoke all on table public.apartment_inventory_categories, public.apartment_inventory_items from public, anon;
grant select, delete on table public.apartment_inventory_categories, public.apartment_inventory_items to authenticated;
grant insert (shop_id, name) on public.apartment_inventory_categories to authenticated;
grant update (name) on public.apartment_inventory_categories to authenticated;
grant insert (shop_id, name, supplier, location, unit, pieces_per_unit, quantity, extra_pieces, wholesale_price, retail_price, wholesale_retail_price, category_name)
  on public.apartment_inventory_items to authenticated;
grant update (name, supplier, location, unit, pieces_per_unit, quantity, extra_pieces, wholesale_price, retail_price, wholesale_retail_price, category_name)
  on public.apartment_inventory_items to authenticated;

notify pgrst, 'reload schema';
commit;
