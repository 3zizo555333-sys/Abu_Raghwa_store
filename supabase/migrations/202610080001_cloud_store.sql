-- Supabase source-of-truth schema for Abu Raghwa Store.
-- Apply with: supabase db push (after reviewing against a non-production project).
begin;

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

do $$ begin
  create type public.shop_role as enum ('manager', 'admin', 'supervisor', 'seller');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.membership_status as enum ('pending', 'active', 'suspended');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.product_sale_mode as enum ('unit', 'weight');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.invoice_status as enum ('completed', 'voided', 'partially_returned', 'returned');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.stock_movement_kind as enum ('sale', 'return', 'adjustment', 'receive', 'waste', 'transfer');
exception when duplicate_object then null; end $$;

create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 180),
  timezone text not null default 'Africa/Cairo',
  currency char(3) not null default 'EGP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id uuid not null references public.shops(id) on delete cascade,
  role public.shop_role not null default 'seller',
  status public.membership_status not null default 'pending',
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, shop_id)
);
create index if not exists shop_memberships_shop_status_idx on public.shop_memberships(shop_id, status, role);

create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, name),
  unique (id, shop_id)
);
create index if not exists product_categories_shop_sort_idx on public.product_categories(shop_id, sort_order, name);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 240),
  code text,
  barcode text,
  barcodes text[] not null default '{}',
  plu text,
  sale_mode public.product_sale_mode not null default 'unit',
  unit_name text not null default 'عبوة',
  content_unit text not null default 'قطعة',
  units_per_package numeric(18,6) not null default 1 check (units_per_package > 0),
  wholesale_price_per_unit numeric(18,4) not null default 0 check (wholesale_price_per_unit >= 0),
  wholesale_price_per_piece numeric(18,4) not null default 0 check (wholesale_price_per_piece >= 0),
  retail_price numeric(18,4) not null default 0 check (retail_price >= 0),
  wholesale_retail_price numeric(18,4) not null default 0 check (wholesale_retail_price >= 0),
  bulk_price numeric(18,4) not null default 0 check (bulk_price >= 0),
  cost_per_unit numeric(18,4) not null default 0 check (cost_per_unit >= 0),
  cost_per_piece numeric(18,4) not null default 0 check (cost_per_piece >= 0),
  bulk_profit_percent numeric(9,4) not null default 0,
  retail_profit_percent numeric(9,4) not null default 0,
  category_id uuid,
  category_name text not null default 'بدون فئة',
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  min_quantity numeric(18,6) not null default 0 check (min_quantity >= 0),
  image_id uuid,
  catalog_image_path text,
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  version bigint not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (category_id, shop_id) references public.product_categories(id, shop_id) on delete set null (category_id)
);
create index if not exists products_shop_created_cursor_idx on public.products(shop_id, created_at desc, id desc) where deleted_at is null;
create index if not exists products_shop_deleted_idx on public.products(shop_id, deleted_at);
create index if not exists products_shop_name_idx on public.products(shop_id, lower(name) text_pattern_ops) where deleted_at is null;
create index if not exists products_name_trgm_idx on public.products using gin(name gin_trgm_ops) where deleted_at is null;
create unique index if not exists products_shop_barcode_unique_idx on public.products(shop_id, barcode) where barcode is not null and deleted_at is null;
create unique index if not exists products_shop_plu_unique_idx on public.products(shop_id, plu) where plu is not null and deleted_at is null;

-- Normalize every barcode so concurrent devices cannot claim the same code.
create table if not exists public.product_barcodes (
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null,
  barcode text not null check (length(trim(barcode)) between 1 and 120),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (shop_id, barcode),
  unique (shop_id, product_id, barcode),
  foreign key (product_id, shop_id) references public.products(id, shop_id) on delete cascade
);
create index if not exists product_barcodes_product_idx on public.product_barcodes(shop_id, product_id);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (product_id, shop_id) references public.products(id, shop_id) on delete cascade
);
create index if not exists product_images_product_idx on public.product_images(shop_id, product_id, created_at desc);
alter table public.products add constraint products_image_shop_fk foreign key (image_id, shop_id) references public.product_images(id, shop_id) on delete set null (image_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  invoice_number text not null,
  idempotency_key uuid not null,
  status public.invoice_status not null default 'completed',
  sale_type text not null default 'retail' check (sale_type in ('retail', 'wholesale', 'bulk')),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'card', 'check', 'bank_transfer', 'other')),
  customer_name text not null default '',
  customer_phone text not null default '',
  subtotal numeric(18,4) not null check (subtotal >= 0),
  discount_type text not null default 'fixed' check (discount_type in ('percent', 'fixed')),
  discount_value numeric(18,4) not null default 0 check (discount_value >= 0),
  discount_amount numeric(18,4) not null default 0 check (discount_amount >= 0),
  total numeric(18,4) not null check (total >= 0),
  loyalty_points_awarded integer not null default 0 check (loyalty_points_awarded >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, invoice_number),
  unique (shop_id, idempotency_key),
  unique (id, shop_id)
);
create index if not exists invoices_shop_created_idx on public.invoices(shop_id, created_at desc, id desc);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  shop_id uuid not null,
  product_id uuid references public.products(id) on delete set null,
  product_name_snapshot text not null,
  product_code_snapshot text,
  selected_unit_snapshot text not null,
  sale_mode_snapshot public.product_sale_mode not null,
  quantity numeric(18,6) not null check (quantity > 0),
  stock_quantity_delta numeric(18,6) not null check (stock_quantity_delta >= 0),
  unit_price_snapshot numeric(18,4) not null check (unit_price_snapshot >= 0),
  unit_cost_snapshot numeric(18,4) not null default 0 check (unit_cost_snapshot >= 0),
  line_total numeric(18,4) not null check (line_total >= 0),
  created_at timestamptz not null default now(),
  foreign key (invoice_id, shop_id) references public.invoices(id, shop_id) on delete restrict
);
create index if not exists invoice_items_invoice_idx on public.invoice_items(shop_id, invoice_id);
create index if not exists invoice_items_product_idx on public.invoice_items(shop_id, product_id, created_at desc);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  invoice_id uuid references public.invoices(id) on delete restrict,
  kind public.stock_movement_kind not null,
  quantity_delta numeric(18,6) not null check (quantity_delta <> 0),
  reason text not null check (length(trim(reason)) between 1 and 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_shop_created_idx on public.stock_movements(shop_id, created_at desc, id desc);
create index if not exists stock_movements_product_idx on public.stock_movements(shop_id, product_id, created_at desc);

create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  changed_fields text[] not null default '{}',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_shop_created_idx on public.audit_events(shop_id, created_at desc, id desc);

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  public_description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'expired')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists offers_shop_status_idx on public.offers(shop_id, status, starts_at, ends_at) where deleted_at is null;

create table if not exists public.offer_purchase_requests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete set null,
  offer_title_snapshot text not null,
  customer_name text not null,
  customer_code text not null,
  customer_phone text,
  points_cost integer not null default 0 check (points_cost >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists offer_requests_shop_status_idx on public.offer_purchase_requests(shop_id, status, created_at desc);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  assigned_to uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists tasks_shop_status_idx on public.tasks(shop_id, status, due_at) where deleted_at is null;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  description text not null check (length(trim(description)) between 1 and 240),
  category text not null default 'عام',
  amount numeric(18,4) not null check (amount >= 0),
  occurred_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists expenses_shop_date_idx on public.expenses(shop_id, occurred_at desc) where deleted_at is null;

create table if not exists public.display_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  pairing_code_hash text not null unique,
  label text not null default 'شاشة العميل',
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  expires_at timestamptz not null,
  last_seen_at timestamptz,
  display_settings jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists display_devices_shop_status_idx on public.display_devices(shop_id, status, expires_at);

-- Realtime carries identifiers and versions only. Clients fetch the authoritative row/page afterwards.
create table if not exists public.shop_change_events (
  id bigint generated always as identity primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  version bigint,
  created_at timestamptz not null default now()
);
create index if not exists shop_change_events_shop_id_idx on public.shop_change_events(shop_id, id desc);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_shop_member(p_shop_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = p_shop_id and m.user_id = (select auth.uid()) and m.status = 'active'
  );
$$;

create or replace function public.has_shop_role(p_shop_id uuid, p_roles public.shop_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.shop_memberships m
    where m.shop_id = p_shop_id and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any(p_roles)
  );
$$;

create or replace function public.emit_shop_change_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_shop_id uuid;
  v_entity_id uuid;
  v_operation text;
  v_version bigint;
begin
  if tg_op = 'DELETE' then
    v_shop_id := old.shop_id;
    v_entity_id := old.id;
    v_operation := 'DELETE';
    v_version := null;
  else
    v_shop_id := new.shop_id;
    v_entity_id := new.id;
    v_version := case when to_jsonb(new) ? 'version' then (to_jsonb(new)->>'version')::bigint else null end;
    if tg_op = 'INSERT' then
      v_operation := 'INSERT';
    elsif tg_table_name = 'products' and old.deleted_at is null and new.deleted_at is not null then
      v_operation := 'DELETE';
    else
      v_operation := 'UPDATE';
    end if;
  end if;
  insert into public.shop_change_events(shop_id, entity_type, entity_id, operation, version)
  values (v_shop_id, tg_table_name, v_entity_id, v_operation, v_version);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.audit_product_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_changed text[] := '{}';
  v_action text;
begin
  if tg_op = 'INSERT' then
    v_action := 'product.created';
    v_changed := array['name','code','barcode','plu','sale_mode','prices','quantity','category'];
  elsif tg_op = 'UPDATE' then
    v_action := case when old.deleted_at is null and new.deleted_at is not null then 'product.deleted' else 'product.updated' end;
    if old.name is distinct from new.name then v_changed := array_append(v_changed, 'name'); end if;
    if old.code is distinct from new.code then v_changed := array_append(v_changed, 'code'); end if;
    if old.barcode is distinct from new.barcode then v_changed := array_append(v_changed, 'barcode'); end if;
    if old.plu is distinct from new.plu then v_changed := array_append(v_changed, 'plu'); end if;
    if old.sale_mode is distinct from new.sale_mode then v_changed := array_append(v_changed, 'sale_mode'); end if;
    if old.retail_price is distinct from new.retail_price or old.wholesale_retail_price is distinct from new.wholesale_retail_price or old.bulk_price is distinct from new.bulk_price or old.cost_per_unit is distinct from new.cost_per_unit or old.cost_per_piece is distinct from new.cost_per_piece then v_changed := array_append(v_changed, 'prices'); end if;
    if old.quantity is distinct from new.quantity then v_changed := array_append(v_changed, 'quantity'); end if;
    if old.category_id is distinct from new.category_id or old.category_name is distinct from new.category_name then v_changed := array_append(v_changed, 'category'); end if;
    if old.image_id is distinct from new.image_id then v_changed := array_append(v_changed, 'image'); end if;
  else
    v_action := 'product.deleted';
  end if;
  insert into public.audit_events(shop_id, actor_id, action, entity_type, entity_id, changed_fields)
  values (coalesce(new.shop_id, old.shop_id), (select auth.uid()), v_action, 'products', coalesce(new.id, old.id), v_changed);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.provision_shop(p_name text, p_manager_user_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_shop_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_name is null or length(trim(p_name)) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_SHOP_NAME';
  end if;
  if not exists (select 1 from auth.users where id = p_manager_user_id) then
    raise exception using errcode = '22023', message = 'AUTH_USER_NOT_FOUND';
  end if;
  insert into public.shops(name) values (trim(p_name)) returning id into v_shop_id;
  insert into public.shop_memberships(user_id, shop_id, role, status, approved_by)
  values (p_manager_user_id, v_shop_id, 'manager', 'active', p_manager_user_id);
  return v_shop_id;
end;
$$;

create or replace function public.list_products_page(
  p_shop_id uuid,
  p_after_created_at timestamptz default null,
  p_after_id uuid default null,
  p_search text default null,
  p_category_id uuid default null,
  p_limit integer default 50
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_is_manager boolean;
  v_items jsonb;
  v_last jsonb;
  v_total bigint;
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if not public.is_shop_member(p_shop_id) then raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED'; end if;
  v_is_manager := public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]);
  select count(*) into v_total from public.products p
    where p.shop_id = p_shop_id and p.deleted_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (nullif(trim(p_search), '') is null or p.name ilike '%' || trim(p_search) || '%' or p.code ilike '%' || trim(p_search) || '%' or p.barcode = trim(p_search) or p.plu = trim(p_search));
  with page as (
    select p.* from public.products p
    where p.shop_id = p_shop_id and p.deleted_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (nullif(trim(p_search), '') is null or p.name ilike '%' || trim(p_search) || '%' or p.code ilike '%' || trim(p_search) || '%' or p.barcode = trim(p_search) or p.plu = trim(p_search))
      and (p_after_created_at is null or (p.created_at, p.id) < (p_after_created_at, p_after_id))
    order by p.created_at desc, p.id desc limit v_limit + 1
  ), delivered as (
    select * from page order by created_at desc, id desc limit v_limit
  )
  select coalesce(jsonb_agg(case when v_is_manager then to_jsonb(d) else to_jsonb(d) - array['wholesale_price_per_unit','wholesale_price_per_piece','cost_per_unit','cost_per_piece','bulk_profit_percent','retail_profit_percent'] end order by d.created_at desc, d.id desc), '[]'::jsonb)
  into v_items from delivered d;
  select to_jsonb(x) into v_last from (
    select p.created_at, p.id from public.products p
    where p.shop_id = p_shop_id and p.deleted_at is null
      and (p_category_id is null or p.category_id = p_category_id)
      and (nullif(trim(p_search), '') is null or p.name ilike '%' || trim(p_search) || '%' or p.code ilike '%' || trim(p_search) || '%' or p.barcode = trim(p_search) or p.plu = trim(p_search))
      and (p_after_created_at is null or (p.created_at, p.id) < (p_after_created_at, p_after_id))
    order by p.created_at desc, p.id desc offset v_limit limit 1
  ) x;
  return jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'has_more', v_last is not null,
    'next_cursor', case when v_last is null then null else jsonb_build_object('created_at', v_last->>'created_at', 'id', v_last->>'id') end
  );
end;
$$;

create or replace function public.create_product(p_shop_id uuid, p_payload jsonb)
returns public.products language plpgsql security definer set search_path = '' as $$
declare v_product public.products;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'PRODUCT_WRITE_FORBIDDEN'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or nullif(trim(p_payload->>'name'), '') is null then raise exception using errcode = '22023', message = 'INVALID_PRODUCT'; end if;
  if jsonb_typeof(coalesce(p_payload->'barcodes','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'barcodes','[]'::jsonb)) > 100 then raise exception using errcode = '22023', message = 'INVALID_BARCODES'; end if;
  insert into public.products(
    shop_id, name, code, barcode, barcodes, plu, sale_mode, unit_name, content_unit, units_per_package,
    wholesale_price_per_unit, wholesale_price_per_piece, retail_price, wholesale_retail_price, bulk_price,
    cost_per_unit, cost_per_piece, bulk_profit_percent, retail_profit_percent, category_id, category_name,
    quantity, min_quantity, loyalty_points, created_by, updated_by
  ) values (
    p_shop_id, trim(p_payload->>'name'), nullif(trim(p_payload->>'code'), ''), nullif(trim(p_payload->>'barcode'), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'barcodes','[]'::jsonb))), '{}'), nullif(trim(p_payload->>'plu'), ''),
    coalesce(nullif(p_payload->>'sale_mode','')::public.product_sale_mode, 'unit'), coalesce(nullif(trim(p_payload->>'unit_name'), ''), 'عبوة'),
    coalesce(nullif(trim(p_payload->>'content_unit'), ''), 'قطعة'), coalesce(nullif(p_payload->>'units_per_package','')::numeric, 1),
    coalesce(nullif(p_payload->>'wholesale_price_per_unit','')::numeric, 0), coalesce(nullif(p_payload->>'wholesale_price_per_piece','')::numeric, 0),
    coalesce(nullif(p_payload->>'retail_price','')::numeric, 0), coalesce(nullif(p_payload->>'wholesale_retail_price','')::numeric, 0),
    coalesce(nullif(p_payload->>'bulk_price','')::numeric, 0), coalesce(nullif(p_payload->>'cost_per_unit','')::numeric, 0),
    coalesce(nullif(p_payload->>'cost_per_piece','')::numeric, 0), coalesce(nullif(p_payload->>'bulk_profit_percent','')::numeric, 0),
    coalesce(nullif(p_payload->>'retail_profit_percent','')::numeric, 0), nullif(p_payload->>'category_id','')::uuid,
    coalesce(nullif(trim(p_payload->>'category_name'), ''), 'بدون فئة'), coalesce(nullif(p_payload->>'quantity','')::numeric, 0),
    coalesce(nullif(p_payload->>'min_quantity','')::numeric, 0), coalesce(nullif(p_payload->>'loyalty_points','')::integer, 0),
    (select auth.uid()), (select auth.uid())
  ) returning * into v_product;
  insert into public.product_barcodes(shop_id, product_id, barcode, is_primary)
  select p_shop_id, v_product.id, code, code = v_product.barcode
  from (select distinct trim(raw_code) as code from unnest(v_product.barcodes || array[v_product.barcode]) raw(raw_code)
        where nullif(trim(raw_code), '') is not null) codes;
  return v_product;
end;
$$;

create or replace function public.update_product(p_shop_id uuid, p_product_id uuid, p_expected_version bigint, p_payload jsonb)
returns public.products language plpgsql security definer set search_path = '' as $$
declare v_current public.products; v_product public.products;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'PRODUCT_WRITE_FORBIDDEN'; end if;
  if p_payload ? 'barcodes' and (jsonb_typeof(p_payload->'barcodes') <> 'array' or jsonb_array_length(p_payload->'barcodes') > 100) then raise exception using errcode = '22023', message = 'INVALID_BARCODES'; end if;
  select * into v_current from public.products where id = p_product_id and shop_id = p_shop_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if v_current.version <> p_expected_version then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  update public.products set
    name = coalesce(nullif(trim(p_payload->>'name'), ''), name),
    code = case when p_payload ? 'code' then nullif(trim(p_payload->>'code'), '') else code end,
    barcode = case when p_payload ? 'barcode' then nullif(trim(p_payload->>'barcode'), '') else barcode end,
    barcodes = case when p_payload ? 'barcodes' then coalesce(array(select jsonb_array_elements_text(p_payload->'barcodes')), '{}') else barcodes end,
    plu = case when p_payload ? 'plu' then nullif(trim(p_payload->>'plu'), '') else plu end,
    sale_mode = coalesce(nullif(p_payload->>'sale_mode','')::public.product_sale_mode, sale_mode),
    unit_name = coalesce(nullif(trim(p_payload->>'unit_name'), ''), unit_name),
    content_unit = coalesce(nullif(trim(p_payload->>'content_unit'), ''), content_unit),
    units_per_package = coalesce(nullif(p_payload->>'units_per_package','')::numeric, units_per_package),
    wholesale_price_per_unit = coalesce(nullif(p_payload->>'wholesale_price_per_unit','')::numeric, wholesale_price_per_unit),
    wholesale_price_per_piece = coalesce(nullif(p_payload->>'wholesale_price_per_piece','')::numeric, wholesale_price_per_piece),
    retail_price = coalesce(nullif(p_payload->>'retail_price','')::numeric, retail_price),
    wholesale_retail_price = coalesce(nullif(p_payload->>'wholesale_retail_price','')::numeric, wholesale_retail_price),
    bulk_price = coalesce(nullif(p_payload->>'bulk_price','')::numeric, bulk_price),
    cost_per_unit = coalesce(nullif(p_payload->>'cost_per_unit','')::numeric, cost_per_unit),
    cost_per_piece = coalesce(nullif(p_payload->>'cost_per_piece','')::numeric, cost_per_piece),
    bulk_profit_percent = coalesce(nullif(p_payload->>'bulk_profit_percent','')::numeric, bulk_profit_percent),
    retail_profit_percent = coalesce(nullif(p_payload->>'retail_profit_percent','')::numeric, retail_profit_percent),
    category_id = case when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else category_id end,
    category_name = coalesce(nullif(trim(p_payload->>'category_name'), ''), category_name),
    quantity = coalesce(nullif(p_payload->>'quantity','')::numeric, quantity),
    min_quantity = coalesce(nullif(p_payload->>'min_quantity','')::numeric, min_quantity),
    loyalty_points = coalesce(nullif(p_payload->>'loyalty_points','')::integer, loyalty_points),
    version = version + 1, updated_by = (select auth.uid()), updated_at = now()
  where id = p_product_id and shop_id = p_shop_id and version = p_expected_version
  returning * into v_product;
  if not found then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  if p_payload ? 'barcode' or p_payload ? 'barcodes' then
    delete from public.product_barcodes where shop_id = p_shop_id and product_id = p_product_id;
    insert into public.product_barcodes(shop_id, product_id, barcode, is_primary)
    select p_shop_id, v_product.id, code, code = v_product.barcode
    from (select distinct trim(raw_code) as code from unnest(v_product.barcodes || array[v_product.barcode]) raw(raw_code)
          where nullif(trim(raw_code), '') is not null) codes;
  end if;
  return v_product;
end;
$$;

create or replace function public.soft_delete_products(p_shop_id uuid, p_product_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count integer;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'PRODUCT_DELETE_FORBIDDEN'; end if;
  if p_product_ids is null or cardinality(p_product_ids) = 0 or cardinality(p_product_ids) > 1000 then raise exception using errcode = '22023', message = 'INVALID_PRODUCT_ID_LIST'; end if;
  update public.products set deleted_at = now(), updated_at = now(), updated_by = (select auth.uid()), version = version + 1
  where shop_id = p_shop_id and id = any(p_product_ids) and deleted_at is null;
  get diagnostics v_count = row_count;
  delete from public.product_barcodes where shop_id = p_shop_id and product_id = any(p_product_ids);
  return v_count;
end;
$$;

create or replace function public.create_invoice_with_stock(
  p_shop_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_sale_type text default 'retail',
  p_payment_method text default 'cash',
  p_customer_name text default '',
  p_customer_phone text default '',
  p_discount_type text default 'fixed',
  p_discount_value numeric default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_item jsonb;
  v_product public.products;
  v_qty numeric(18,6);
  v_unit text;
  v_price numeric(18,4);
  v_cost numeric(18,4);
  v_stock_delta numeric(18,6);
  v_line_total numeric(18,4);
  v_subtotal numeric(18,4) := 0;
  v_discount numeric(18,4) := 0;
  v_total numeric(18,4) := 0;
  v_units numeric(18,6);
  v_outer boolean;
begin
  if not public.is_shop_member(p_shop_id) then raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED'; end if;
  if coalesce(p_sale_type,'') not in ('retail','wholesale','bulk') or coalesce(p_discount_type,'') not in ('percent','fixed') or p_discount_value < 0 or (p_discount_type = 'percent' and p_discount_value > 100) then raise exception using errcode = '22023', message = 'INVALID_INVOICE'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then raise exception using errcode = '22023', message = 'INVALID_INVOICE_ITEMS'; end if;
  insert into public.invoices(shop_id, invoice_number, idempotency_key, sale_type, payment_method, customer_name, customer_phone, subtotal, discount_type, discount_value, discount_amount, total, created_by)
  values (p_shop_id, 'pending-' || p_idempotency_key::text, p_idempotency_key, p_sale_type, p_payment_method, left(coalesce(p_customer_name,''),255), left(coalesce(p_customer_phone,''),32), 0, p_discount_type, p_discount_value, 0, 0, (select auth.uid()))
  on conflict (shop_id, idempotency_key) do nothing returning id into v_invoice_id;
  if v_invoice_id is null then
    select id, invoice_number, subtotal, discount_amount, total into v_invoice_id, v_invoice_number, v_subtotal, v_discount, v_total
      from public.invoices where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'subtotal', v_subtotal, 'discount_amount', v_discount, 'total', v_total, 'idempotent_replay', true);
  end if;
  v_invoice_number := 'INV-' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || '-' || substr(replace(v_invoice_id::text, '-', ''), 1, 6);
  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_unit := coalesce(nullif(trim(v_item->>'selected_unit_type'), ''), '');
    if v_qty is null or v_qty <= 0 then raise exception using errcode = '22023', message = 'INVALID_INVOICE_QUANTITY'; end if;
    select * into v_product from public.products where id = nullif(v_item->>'product_id','')::uuid and shop_id = p_shop_id and deleted_at is null for update;
    if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_AVAILABLE'; end if;
    v_units := greatest(v_product.units_per_package, 0.000001);
    v_outer := v_unit = v_product.unit_name;
    if not v_outer and v_unit <> v_product.content_unit then raise exception using errcode = '22023', message = 'INVALID_PRODUCT_UNIT'; end if;
    v_stock_delta := case when v_outer then v_qty else v_qty / v_units end;
    if v_product.quantity < v_stock_delta then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK:' || v_product.name; end if;
    v_price := case p_sale_type
      when 'wholesale' then coalesce(nullif(v_product.wholesale_retail_price,0), v_product.retail_price)
      when 'bulk' then coalesce(nullif(v_product.bulk_price,0), nullif(v_product.wholesale_retail_price,0), v_product.retail_price)
      else v_product.retail_price end;
    if v_outer then v_price := v_price * v_units; end if;
    v_cost := case when v_outer then coalesce(nullif(v_product.wholesale_price_per_unit,0), v_product.cost_per_piece * v_units) else coalesce(nullif(v_product.cost_per_piece,0), v_product.cost_per_unit) end;
    v_line_total := round(v_qty * v_price, 4);
    v_subtotal := v_subtotal + v_line_total;
    insert into public.invoice_items(invoice_id, shop_id, product_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, unit_cost_snapshot, line_total)
    values (v_invoice_id, p_shop_id, v_product.id, v_product.name, v_product.code, v_unit, v_product.sale_mode, v_qty, v_stock_delta, v_price, v_cost, v_line_total);
    update public.products set quantity = quantity - v_stock_delta, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where id = v_product.id and shop_id = p_shop_id;
    insert into public.stock_movements(shop_id, product_id, invoice_id, kind, quantity_delta, reason, created_by)
    values (p_shop_id, v_product.id, v_invoice_id, 'sale', -v_stock_delta, 'بيع ' || v_invoice_id::text, (select auth.uid()));
  end loop;
  v_discount := case when p_discount_type = 'percent' then round(v_subtotal * p_discount_value / 100,4) else least(v_subtotal, p_discount_value) end;
  v_total := greatest(0, v_subtotal - v_discount);
  update public.invoices set invoice_number = v_invoice_number, subtotal = v_subtotal, discount_amount = v_discount, total = v_total where id = v_invoice_id;
  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'subtotal', v_subtotal, 'discount_amount', v_discount, 'total', v_total, 'idempotent_replay', false);
end;
$$;

create or replace function public.prevent_ledger_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '42501', message = 'LEDGER_ROWS_ARE_IMMUTABLE';
end;
$$;

-- Cookie-auth profiles are created for every Supabase Auth account.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id, display_name)
  values (new.id, nullif(trim(new.raw_user_meta_data->>'full_name'), ''))
  on conflict (user_id) do update set display_name = coalesce(excluded.display_name, public.profiles.display_name);
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users for each row execute function public.handle_new_auth_user();

-- Maintenance triggers.
do $$ declare t text; begin
  foreach t in array array['shops','profiles','shop_memberships','product_categories','offers','offer_purchase_requests','tasks','expenses'] loop
    execute format('drop trigger if exists %I_touch_updated_at on public.%I', t, t);
    execute format('create trigger %I_touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;
drop trigger if exists products_touch_updated_at on public.products;
create trigger products_touch_updated_at before update on public.products for each row execute function public.touch_updated_at();
drop trigger if exists products_emit_event on public.products;
create trigger products_emit_event after insert or update or delete on public.products for each row execute function public.emit_shop_change_event();
drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products for each row execute function public.audit_product_change();
drop trigger if exists invoices_emit_event on public.invoices;
create trigger invoices_emit_event after insert or update or delete on public.invoices for each row execute function public.emit_shop_change_event();
drop trigger if exists tasks_emit_event on public.tasks;
create trigger tasks_emit_event after insert or update or delete on public.tasks for each row execute function public.emit_shop_change_event();
drop trigger if exists offers_emit_event on public.offers;
create trigger offers_emit_event after insert or update or delete on public.offers for each row execute function public.emit_shop_change_event();
drop trigger if exists stock_movements_immutable on public.stock_movements;
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function public.prevent_ledger_mutation();
drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function public.prevent_ledger_mutation();

-- RLS on every public business table.
do $$ declare t text; begin
  foreach t in array array['shops','profiles','shop_memberships','product_categories','products','product_barcodes','product_images','invoices','invoice_items','stock_movements','audit_events','offers','offer_purchase_requests','tasks','expenses','display_devices','shop_change_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

create policy shops_member_read on public.shops for select to authenticated using (public.is_shop_member(id));
create policy profiles_self_read on public.profiles for select to authenticated using (user_id = (select auth.uid()) or exists (select 1 from public.shop_memberships mine join public.shop_memberships theirs on theirs.shop_id = mine.shop_id where mine.user_id = (select auth.uid()) and mine.status = 'active' and mine.role in ('manager','admin','supervisor') and theirs.user_id = profiles.user_id and theirs.status = 'active'));
create policy profiles_self_update on public.profiles for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy memberships_read_self_or_manager on public.shop_memberships for select to authenticated using (user_id = (select auth.uid()) or public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy categories_member_read on public.product_categories for select to authenticated using (public.is_shop_member(shop_id));
create policy images_member_read on public.product_images for select to authenticated using (public.is_shop_member(shop_id));
create policy invoices_member_read on public.invoices for select to authenticated using (public.is_shop_member(shop_id));
create policy offer_items_member_read on public.invoice_items for select to authenticated using (public.is_shop_member(shop_id));
create policy stock_movements_manager_read on public.stock_movements for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy audit_events_manager_read on public.audit_events for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy offers_active_public_read on public.offers for select to anon, authenticated using (status = 'active' and deleted_at is null and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy offers_manager_read on public.offers for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy offer_requests_staff_read on public.offer_purchase_requests for select to authenticated using (public.is_shop_member(shop_id));
create policy tasks_member_read on public.tasks for select to authenticated using (public.is_shop_member(shop_id) and deleted_at is null);
create policy expenses_manager_read on public.expenses for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy display_device_manager_read on public.display_devices for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shop_events_member_read on public.shop_change_events for select to authenticated using (public.is_shop_member(shop_id));

-- No direct table mutation of products/invoices/ledger from browser roles.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.shops, public.profiles, public.shop_memberships, public.product_categories, public.product_images, public.invoices, public.offers, public.offer_purchase_requests, public.tasks, public.shop_change_events to authenticated;
grant select on public.offers to anon;
-- Costs and profit fields are deliberately not available from invoice_items to sellers.
create or replace view public.seller_invoice_items with (security_barrier = true) as
  select id, invoice_id, shop_id, product_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, line_total, created_at
  from public.invoice_items where public.is_shop_member(shop_id);
create or replace view public.manager_invoice_items with (security_barrier = true) as
  select id, invoice_id, shop_id, product_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, unit_cost_snapshot, line_total, created_at
  from public.invoice_items where public.is_shop_member(shop_id) and public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]);
revoke all on public.seller_invoice_items, public.manager_invoice_items from public, anon, authenticated;
revoke all on public.invoice_items from anon, authenticated;
grant select on public.seller_invoice_items to authenticated;
grant select on public.manager_invoice_items to authenticated;
grant select on public.stock_movements, public.audit_events, public.expenses, public.display_devices to authenticated;
grant select on public.tasks to authenticated;
grant select on public.shop_change_events to authenticated;
grant update (display_name, phone) on public.profiles to authenticated;

-- RPC functions are the only write surface for critical product and invoice operations.
revoke all on function public.provision_shop(text, uuid) from public, anon, authenticated;
grant execute on function public.provision_shop(text, uuid) to service_role;
revoke all on function public.list_products_page(uuid, timestamptz, uuid, text, uuid, integer) from public, anon;
grant execute on function public.list_products_page(uuid, timestamptz, uuid, text, uuid, integer) to authenticated;
revoke all on function public.create_product(uuid, jsonb) from public, anon;
grant execute on function public.create_product(uuid, jsonb) to authenticated;
revoke all on function public.update_product(uuid, uuid, bigint, jsonb) from public, anon;
grant execute on function public.update_product(uuid, uuid, bigint, jsonb) to authenticated;
revoke all on function public.soft_delete_products(uuid, uuid[]) from public, anon;
grant execute on function public.soft_delete_products(uuid, uuid[]) to authenticated;
revoke all on function public.create_invoice_with_stock(uuid, uuid, jsonb, text, text, text, text, text, numeric) from public, anon;
grant execute on function public.create_invoice_with_stock(uuid, uuid, jsonb, text, text, text, text, text, numeric) to authenticated;

-- Helpers are callable only by signed-in users where RLS policies need them.
revoke all on function public.is_shop_member(uuid) from public, anon;
revoke all on function public.has_shop_role(uuid, public.shop_role[]) from public, anon;
grant execute on function public.is_shop_member(uuid) to authenticated;
grant execute on function public.has_shop_role(uuid, public.shop_role[]) to authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.emit_shop_change_event() from public, anon, authenticated;
revoke all on function public.audit_product_change() from public, anon, authenticated;
revoke all on function public.prevent_ledger_mutation() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

-- Private product image bucket, 5 MB hard limit, JPEG/PNG/WebP only.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create or replace function public.shop_id_from_storage_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/products/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.](webp|png|jpg|jpeg)$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
create or replace function public.register_product_image(
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_version bigint,
  p_image_id uuid,
  p_storage_path text,
  p_content_type text,
  p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_metadata jsonb;
  v_object_size bigint;
  v_object_type text;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'IMAGE_UPLOAD_FORBIDDEN'; end if;
  if p_content_type not in ('image/jpeg','image/png','image/webp') or p_size_bytes < 1 or p_size_bytes > 5242880 then raise exception using errcode = '22023', message = 'INVALID_PRODUCT_IMAGE'; end if;
  if public.shop_id_from_storage_path(p_storage_path) is distinct from p_shop_id
     or split_part(p_storage_path, '/', 3)::uuid is distinct from p_product_id
     or split_part(split_part(p_storage_path, '/', 4), '.', 1)::uuid is distinct from p_image_id then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT_IMAGE_PATH';
  end if;
  select * into v_product from public.products where id = p_product_id and shop_id = p_shop_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if v_product.version <> p_expected_version then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  select metadata into v_metadata from storage.objects where bucket_id = 'product-images' and name = p_storage_path;
  if not found then raise exception using errcode = 'P0002', message = 'STORAGE_OBJECT_NOT_FOUND'; end if;
  v_object_size := nullif(v_metadata->>'size','')::bigint;
  v_object_type := v_metadata->>'mimetype';
  if v_object_size is distinct from p_size_bytes or v_object_type is distinct from p_content_type then raise exception using errcode = '22023', message = 'STORAGE_METADATA_MISMATCH'; end if;
  insert into public.product_images(id, shop_id, product_id, storage_path, content_type, size_bytes, created_by)
  values (p_image_id, p_shop_id, p_product_id, p_storage_path, p_content_type, p_size_bytes, (select auth.uid()));
  update public.products set image_id = p_image_id, catalog_image_path = p_storage_path, version = version + 1, updated_at = now(), updated_by = (select auth.uid())
  where id = p_product_id and shop_id = p_shop_id;
  return p_image_id;
end;
$$;
revoke all on function public.shop_id_from_storage_path(text) from public, anon;
grant execute on function public.shop_id_from_storage_path(text) to authenticated;
revoke all on function public.register_product_image(uuid, uuid, bigint, uuid, text, text, bigint) from public, anon;
grant execute on function public.register_product_image(uuid, uuid, bigint, uuid, text, text, bigint) to authenticated;
drop policy if exists product_image_member_read on storage.objects;
drop policy if exists product_image_manager_insert on storage.objects;
drop policy if exists product_image_manager_delete on storage.objects;
create policy product_image_member_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.is_shop_member(public.shop_id_from_storage_path(name)));
create policy product_image_manager_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_shop_role(public.shop_id_from_storage_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' in ('image/jpeg','image/png','image/webp')
  );
create policy product_image_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_shop_role(public.shop_id_from_storage_path(name), array['manager','admin','supervisor']::public.shop_role[]));

-- Realtime publishes only safe event metadata, not product rows, costs, or customer data.
alter table public.shop_change_events replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.shop_change_events;
exception when duplicate_object then null; when undefined_object then null; end $$;

commit;
