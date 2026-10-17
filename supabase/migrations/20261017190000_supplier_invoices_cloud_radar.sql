begin;

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  supplier_name text not null check (length(trim(supplier_name)) between 1 and 180),
  invoice_date date not null default current_date,
  image_url text not null,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  notes text not null default '',
  created_at timestamptz not null default now(),
  constraint supplier_invoices_store_id_uuid check (store_id::uuid is not null)
);

create table if not exists public.supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id) on delete cascade,
  item_name text not null check (length(trim(item_name)) between 1 and 180),
  barcode text,
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit_cost numeric(14,4) not null check (unit_cost >= 0),
  total_cost numeric(14,2) not null check (total_cost >= 0),
  previous_cost numeric(14,4),
  price_diff numeric(14,4),
  price_direction text not null default 'stable' check (price_direction in ('up','down','stable')),
  created_at timestamptz not null default now()
);
create index if not exists supplier_invoices_store_date_idx on public.supplier_invoices(store_id, invoice_date desc, created_at desc);
create index if not exists supplier_invoice_items_invoice_idx on public.supplier_invoice_items(invoice_id, item_name);
create index if not exists supplier_invoice_items_name_idx on public.supplier_invoice_items(lower(item_name), barcode);

alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoices force row level security;
alter table public.supplier_invoice_items enable row level security;
alter table public.supplier_invoice_items force row level security;
revoke all on public.supplier_invoices, public.supplier_invoice_items from public, anon;
grant select, insert, update, delete on public.supplier_invoices, public.supplier_invoice_items to authenticated;

drop policy if exists supplier_invoices_manager_read on public.supplier_invoices;
drop policy if exists supplier_invoices_manager_insert on public.supplier_invoices;
drop policy if exists supplier_invoices_manager_update on public.supplier_invoices;
drop policy if exists supplier_invoices_manager_delete on public.supplier_invoices;
create policy supplier_invoices_manager_read on public.supplier_invoices for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy supplier_invoices_manager_insert on public.supplier_invoices for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy supplier_invoices_manager_update on public.supplier_invoices for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy supplier_invoices_manager_delete on public.supplier_invoices for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

drop policy if exists supplier_invoice_items_manager_read on public.supplier_invoice_items;
drop policy if exists supplier_invoice_items_manager_insert on public.supplier_invoice_items;
drop policy if exists supplier_invoice_items_manager_update on public.supplier_invoice_items;
drop policy if exists supplier_invoice_items_manager_delete on public.supplier_invoice_items;
create policy supplier_invoice_items_manager_read on public.supplier_invoice_items for select to authenticated
  using (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin','supervisor']::public.shop_role[])));
create policy supplier_invoice_items_manager_insert on public.supplier_invoice_items for insert to authenticated
  with check (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin']::public.shop_role[])));
create policy supplier_invoice_items_manager_update on public.supplier_invoice_items for update to authenticated
  using (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin']::public.shop_role[])))
  with check (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin']::public.shop_role[])));
create policy supplier_invoice_items_manager_delete on public.supplier_invoice_items for delete to authenticated
  using (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin']::public.shop_role[])));

insert into storage.buckets (id, name, public) values ('invoices-images', 'invoices-images', true)
on conflict (id) do update set public = true;
drop policy if exists invoices_images_public_read on storage.objects;
drop policy if exists invoices_images_authenticated_insert on storage.objects;
drop policy if exists invoices_images_authenticated_delete on storage.objects;
create policy invoices_images_public_read on storage.objects for select to public
  using (bucket_id = 'invoices-images');
create policy invoices_images_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices-images' and (storage.foldername(name))[1]::uuid in (select sm.shop_id from public.shop_memberships sm where sm.user_id = auth.uid() and sm.status = 'active' and sm.role in ('manager','admin')));
create policy invoices_images_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices-images' and (storage.foldername(name))[1]::uuid in (select sm.shop_id from public.shop_memberships sm where sm.user_id = auth.uid() and sm.status = 'active' and sm.role in ('manager','admin')));

alter table public.supplier_invoices replica identity full;
alter table public.supplier_invoice_items replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'supplier_invoices') then
    alter publication supabase_realtime add table public.supplier_invoices;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'supplier_invoice_items') then
    alter publication supabase_realtime add table public.supplier_invoice_items;
  end if;
end;
$$;
commit;
