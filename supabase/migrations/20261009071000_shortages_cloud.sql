begin;

create table public.shortage_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid,
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) between 1 and 160),
  current_quantity numeric(14,3) not null default 0 check (current_quantity >= 0),
  min_quantity numeric(14,3) not null check (min_quantity >= 0),
  shortage numeric(14,3) generated always as (greatest(min_quantity - current_quantity, 0)) stored,
  unit text not null default '' check (length(unit) <= 40),
  reported_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'ordered', 'received')),
  notes text not null default '' check (length(notes) <= 500),
  category text not null check (length(btrim(category)) between 1 and 80),
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shortage_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.shortage_manual_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_name text not null check (length(btrim(category_name)) between 1 and 80),
  name text not null check (length(btrim(name)) between 1 and 120),
  unit text not null default '' check (length(unit) <= 40),
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index shortage_items_shop_date_idx on public.shortage_items(shop_id, reported_at desc, id desc) where deleted_at is null;
create index shortage_items_shop_status_idx on public.shortage_items(shop_id, status) where deleted_at is null;
create unique index shortage_categories_shop_name_idx on public.shortage_categories(shop_id, lower(name)) where deleted_at is null;
create unique index shortage_manual_products_shop_category_name_idx on public.shortage_manual_products(shop_id, lower(category_name), lower(name)) where deleted_at is null;

alter table public.shortage_items enable row level security;
alter table public.shortage_items force row level security;
alter table public.shortage_categories enable row level security;
alter table public.shortage_categories force row level security;
alter table public.shortage_manual_products enable row level security;
alter table public.shortage_manual_products force row level security;

create policy shortage_items_supervisor_read on public.shortage_items for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_items_supervisor_insert on public.shortage_items for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_items_supervisor_update on public.shortage_items for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy shortage_categories_supervisor_read on public.shortage_categories for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_categories_supervisor_insert on public.shortage_categories for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_categories_supervisor_update on public.shortage_categories for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy shortage_manual_products_supervisor_read on public.shortage_manual_products for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_manual_products_supervisor_insert on public.shortage_manual_products for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_manual_products_supervisor_update on public.shortage_manual_products for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create trigger shortage_items_touch_updated_at before update on public.shortage_items for each row execute function public.touch_updated_at();
create trigger shortage_categories_touch_updated_at before update on public.shortage_categories for each row execute function public.touch_updated_at();
create trigger shortage_manual_products_touch_updated_at before update on public.shortage_manual_products for each row execute function public.touch_updated_at();
create trigger shortage_items_emit_event after insert or update or delete on public.shortage_items for each row execute function public.emit_shop_change_event();
create trigger shortage_categories_emit_event after insert or update or delete on public.shortage_categories for each row execute function public.emit_shop_change_event();
create trigger shortage_manual_products_emit_event after insert or update or delete on public.shortage_manual_products for each row execute function public.emit_shop_change_event();

revoke all on public.shortage_items, public.shortage_categories, public.shortage_manual_products from public, anon, authenticated;
grant select, insert, update on public.shortage_items, public.shortage_categories, public.shortage_manual_products to authenticated;

create or replace function public.replace_shortage_manual_products(p_shop_id uuid, p_category text, p_names text[])
returns setof public.shortage_manual_products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_category text := btrim(coalesce(p_category, ''));
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if length(v_category) not between 1 and 80 then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_names), 0) > 500 then
    raise exception 'too_many_manual_products' using errcode = '22023';
  end if;

  update public.shortage_manual_products
  set deleted_at = now(), version = version + 1
  where shop_id = p_shop_id and lower(category_name) = lower(v_category) and deleted_at is null;

  for v_name in
    select distinct btrim(value)
    from unnest(coalesce(p_names, array[]::text[])) as names(value)
    where length(btrim(value)) between 1 and 120
    order by 1
  loop
    insert into public.shortage_manual_products(shop_id, category_name, name)
    values (p_shop_id, v_category, v_name);
  end loop;

  return query
    select * from public.shortage_manual_products
    where shop_id = p_shop_id and lower(category_name) = lower(v_category) and deleted_at is null
    order by name;
end;
$$;

revoke all on function public.replace_shortage_manual_products(uuid, text, text[]) from public, anon;
grant execute on function public.replace_shortage_manual_products(uuid, text, text[]) to authenticated;

commit;
