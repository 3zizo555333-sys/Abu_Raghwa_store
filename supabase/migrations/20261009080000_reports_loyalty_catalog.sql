begin;

-- Batch 3 cloud schema: reports, loyalty, rewards, gift redemptions and catalog orders.
-- This migration is intentionally additive and does not import or delete browser data.

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 180),
  description text not null default '',
  cost_price numeric(18,4) not null default 0 check (cost_price >= 0),
  retail_price numeric(18,4) not null default 0 check (retail_price >= 0),
  category text not null default 'عام' check (length(btrim(category)) between 1 and 120),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid,
  unit text not null check (length(btrim(unit)) between 1 and 40),
  quantity numeric(18,6) not null check (quantity > 0),
  cost numeric(18,4) not null default 0 check (cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (recipe_id, shop_id) references public.recipes(id, shop_id) on delete cascade,
  foreign key (product_id, shop_id) references public.products(id, shop_id) on delete restrict
);

create table public.loyalty_customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_code text not null check (length(btrim(customer_code)) between 1 and 80),
  full_name text not null default '' check (length(full_name) <= 180),
  phone text not null default '' check (length(phone) <= 40),
  current_points numeric(18,2) not null default 0 check (current_points >= 0),
  total_points_earned numeric(18,2) not null default 0 check (total_points_earned >= 0),
  total_spent numeric(18,4) not null default 0 check (total_spent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  gift_name text not null check (length(btrim(gift_name)) between 1 and 180),
  points_required numeric(18,2) not null check (points_required > 0),
  gift_cost numeric(18,4) not null default 0 check (gift_cost >= 0),
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null,
  reward_id uuid not null,
  points_deducted numeric(18,2) not null check (points_deducted > 0),
  gift_cost numeric(18,4) not null default 0 check (gift_cost >= 0),
  delivered_at timestamptz not null default now(),
  delivered_by uuid references auth.users(id) on delete set null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  foreign key (customer_id, shop_id) references public.loyalty_customers(id, shop_id) on delete restrict,
  foreign key (reward_id, shop_id) references public.loyalty_rewards(id, shop_id) on delete restrict
);

create table public.catalog_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_name text not null default '' check (length(customer_name) <= 180),
  customer_phone text not null default '' check (length(customer_phone) <= 40),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  total_amount numeric(18,4) not null default 0 check (total_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'delivered', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_shop_updated_idx on public.recipes(shop_id, updated_at desc, id desc) where deleted_at is null;
create unique index recipes_shop_name_idx on public.recipes(shop_id, lower(name)) where deleted_at is null;
create index recipe_ingredients_recipe_idx on public.recipe_ingredients(shop_id, recipe_id);
create index recipe_ingredients_product_idx on public.recipe_ingredients(shop_id, product_id);
create index loyalty_customers_shop_updated_idx on public.loyalty_customers(shop_id, updated_at desc, id desc) where deleted_at is null;
create unique index loyalty_customers_shop_code_idx on public.loyalty_customers(shop_id, lower(customer_code)) where deleted_at is null;
create index loyalty_rewards_shop_active_idx on public.loyalty_rewards(shop_id, is_active, points_required) where deleted_at is null;
create unique index loyalty_rewards_shop_name_idx on public.loyalty_rewards(shop_id, lower(gift_name)) where deleted_at is null;
create index loyalty_redemptions_shop_date_idx on public.loyalty_redemptions(shop_id, delivered_at desc, id desc);
create index loyalty_redemptions_customer_idx on public.loyalty_redemptions(shop_id, customer_id, delivered_at desc);
create index catalog_orders_shop_status_idx on public.catalog_orders(shop_id, status, created_at desc, id desc);

alter table public.recipes enable row level security;
alter table public.recipes force row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.recipe_ingredients force row level security;
alter table public.loyalty_customers enable row level security;
alter table public.loyalty_customers force row level security;
alter table public.loyalty_rewards enable row level security;
alter table public.loyalty_rewards force row level security;
alter table public.loyalty_redemptions enable row level security;
alter table public.loyalty_redemptions force row level security;
alter table public.catalog_orders enable row level security;
alter table public.catalog_orders force row level security;

-- Reports, recipes, rewards, redemptions and catalog administration are manager-only.
create policy recipes_manager_read on public.recipes for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
create policy recipes_manager_insert on public.recipes for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy recipes_manager_update on public.recipes for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy recipe_ingredients_manager_read on public.recipe_ingredients for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy recipe_ingredients_manager_insert on public.recipe_ingredients for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy recipe_ingredients_manager_update on public.recipe_ingredients for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy loyalty_customers_manager_read on public.loyalty_customers for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
create policy loyalty_customers_manager_insert on public.loyalty_customers for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_customers_manager_update on public.loyalty_customers for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy loyalty_rewards_manager_read on public.loyalty_rewards for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
create policy loyalty_rewards_manager_insert on public.loyalty_rewards for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_rewards_manager_update on public.loyalty_rewards for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy loyalty_redemptions_manager_read on public.loyalty_redemptions for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_redemptions_manager_insert on public.loyalty_redemptions for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy catalog_orders_manager_read on public.catalog_orders for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy catalog_orders_manager_insert on public.catalog_orders for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy catalog_orders_manager_update on public.catalog_orders for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

-- Sellers can read only this deliberately narrow projection; gift costs remain inaccessible.
create or replace view public.loyalty_customer_balances
with (security_invoker = false) as
select id, shop_id, customer_code, full_name, phone, current_points
from public.loyalty_customers
where public.is_shop_member(shop_id) and deleted_at is null;

revoke all on public.loyalty_customer_balances from public, anon;
grant select on public.loyalty_customer_balances to authenticated;

create trigger recipes_touch_updated_at before update on public.recipes for each row execute function public.touch_updated_at();
create trigger recipe_ingredients_touch_updated_at before update on public.recipe_ingredients for each row execute function public.touch_updated_at();
create trigger loyalty_customers_touch_updated_at before update on public.loyalty_customers for each row execute function public.touch_updated_at();
create trigger loyalty_rewards_touch_updated_at before update on public.loyalty_rewards for each row execute function public.touch_updated_at();
create trigger catalog_orders_touch_updated_at before update on public.catalog_orders for each row execute function public.touch_updated_at();

create trigger recipes_emit_event after insert or update or delete on public.recipes for each row execute function public.emit_shop_change_event();
create trigger recipe_ingredients_emit_event after insert or update or delete on public.recipe_ingredients for each row execute function public.emit_shop_change_event();
create trigger loyalty_customers_emit_event after insert or update or delete on public.loyalty_customers for each row execute function public.emit_shop_change_event();
create trigger loyalty_rewards_emit_event after insert or update or delete on public.loyalty_rewards for each row execute function public.emit_shop_change_event();
create trigger loyalty_redemptions_emit_event after insert or update or delete on public.loyalty_redemptions for each row execute function public.emit_shop_change_event();
create trigger catalog_orders_emit_event after insert or update or delete on public.catalog_orders for each row execute function public.emit_shop_change_event();

revoke all on public.recipes, public.recipe_ingredients, public.loyalty_customers, public.loyalty_rewards, public.loyalty_redemptions, public.catalog_orders from public, anon, authenticated;
grant select, insert, update on public.recipes, public.recipe_ingredients, public.loyalty_customers, public.loyalty_rewards, public.loyalty_redemptions, public.catalog_orders to authenticated;
grant select on public.loyalty_customer_balances to authenticated;

-- Add the new source tables to Supabase Realtime when the publication is available.
do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['recipes','recipe_ingredients','loyalty_customers','loyalty_rewards','loyalty_redemptions','catalog_orders'] loop
      if not exists (
        select 1 from pg_catalog.pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
