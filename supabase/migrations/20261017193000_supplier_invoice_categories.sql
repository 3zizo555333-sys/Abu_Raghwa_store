begin;

-- Compatibility for stores created by the older shortages migration.
alter table public.shortage_categories add column if not exists icon text;

create table if not exists public.supplier_invoice_categories (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  name text not null check (length(trim(name)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (store_id, name),
  constraint supplier_invoice_categories_store_id_uuid check (store_id::uuid is not null)
);
create index if not exists supplier_invoice_categories_store_idx on public.supplier_invoice_categories(store_id, name);
alter table public.supplier_invoices add column if not exists category_id uuid references public.supplier_invoice_categories(id) on delete set null;

alter table public.supplier_invoice_categories enable row level security;
alter table public.supplier_invoice_categories force row level security;
revoke all on public.supplier_invoice_categories from public, anon;
grant select, insert, update, delete on public.supplier_invoice_categories to authenticated;
drop policy if exists supplier_invoice_categories_read on public.supplier_invoice_categories;
drop policy if exists supplier_invoice_categories_insert on public.supplier_invoice_categories;
drop policy if exists supplier_invoice_categories_update on public.supplier_invoice_categories;
drop policy if exists supplier_invoice_categories_delete on public.supplier_invoice_categories;
create policy supplier_invoice_categories_read on public.supplier_invoice_categories for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy supplier_invoice_categories_insert on public.supplier_invoice_categories for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy supplier_invoice_categories_update on public.supplier_invoice_categories for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy supplier_invoice_categories_delete on public.supplier_invoice_categories for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

-- The OCR screen is available to supervisors; keep upload scoped to an active membership and store folder.
drop policy if exists invoices_images_authenticated_insert on storage.objects;
drop policy if exists invoices_images_authenticated_delete on storage.objects;
create policy invoices_images_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'invoices-images' and (storage.foldername(name))[1]::uuid in (select sm.shop_id from public.shop_memberships sm where sm.user_id = auth.uid() and sm.status = 'active' and sm.role in ('manager','admin','supervisor')));
create policy invoices_images_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'invoices-images' and (storage.foldername(name))[1]::uuid in (select sm.shop_id from public.shop_memberships sm where sm.user_id = auth.uid() and sm.status = 'active' and sm.role in ('manager','admin','supervisor')));

-- Supervisors can review and save OCR entries; only managers/admins can delete them.
drop policy if exists supplier_invoices_manager_insert on public.supplier_invoices;
drop policy if exists supplier_invoices_manager_update on public.supplier_invoices;
create policy supplier_invoices_manager_insert on public.supplier_invoices for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy supplier_invoices_manager_update on public.supplier_invoices for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
drop policy if exists supplier_invoice_items_manager_insert on public.supplier_invoice_items;
drop policy if exists supplier_invoice_items_manager_update on public.supplier_invoice_items;
create policy supplier_invoice_items_manager_insert on public.supplier_invoice_items for insert to authenticated
  with check (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin','supervisor']::public.shop_role[])));
create policy supplier_invoice_items_manager_update on public.supplier_invoice_items for update to authenticated
  using (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin','supervisor']::public.shop_role[])))
  with check (exists (select 1 from public.supplier_invoices i where i.id = invoice_id and public.has_shop_role(i.store_id::uuid, array['manager','admin','supervisor']::public.shop_role[])));

commit;
