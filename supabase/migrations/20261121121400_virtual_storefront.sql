begin;

create table if not exists public.virtual_store_layouts (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  layout jsonb not null default '{"version":1,"nodes":[]}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint virtual_store_layouts_layout_object check (jsonb_typeof(layout) = 'object' and jsonb_typeof(layout->'nodes') = 'array')
);

alter table public.virtual_store_layouts enable row level security;

drop policy if exists virtual_store_layouts_public_read on public.virtual_store_layouts;
create policy virtual_store_layouts_public_read
  on public.virtual_store_layouts for select to anon, authenticated
  using (true);

drop policy if exists virtual_store_layouts_manager_insert on public.virtual_store_layouts;
create policy virtual_store_layouts_manager_insert
  on public.virtual_store_layouts for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

drop policy if exists virtual_store_layouts_manager_update on public.virtual_store_layouts;
create policy virtual_store_layouts_manager_update
  on public.virtual_store_layouts for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

drop policy if exists virtual_store_layouts_manager_delete on public.virtual_store_layouts;
create policy virtual_store_layouts_manager_delete
  on public.virtual_store_layouts for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

grant select on public.virtual_store_layouts to anon, authenticated;
grant insert, update, delete on public.virtual_store_layouts to authenticated;

create or replace function public.get_public_catalog_stock(p_shop_id uuid)
returns table(product_id uuid, quantity numeric)
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.id, p.quantity
  from public.products p
  where p.shop_id = p_shop_id
    and p.deleted_at is null
    and p.catalog_visible = true;
$$;

revoke all on function public.get_public_catalog_stock(uuid) from public;
grant execute on function public.get_public_catalog_stock(uuid) to anon, authenticated;

commit;
