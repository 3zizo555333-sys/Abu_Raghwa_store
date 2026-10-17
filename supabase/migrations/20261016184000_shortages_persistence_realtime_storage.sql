begin;

create table if not exists public.shortage_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  store_id text generated always as (shop_id::text) stored,
  name text not null check (length(btrim(name)) between 1 and 80),
  icon text,
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.shortage_categories add column if not exists icon text;

create table if not exists public.shortage_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  store_id text generated always as (shop_id::text) stored,
  category_id uuid references public.shortage_categories(id) on delete set null,
  product_id uuid,
  product_name_snapshot text not null check (length(btrim(product_name_snapshot)) between 1 and 160),
  item_name text generated always as (product_name_snapshot) stored,
  current_quantity numeric(14,3) not null default 0 check (current_quantity >= 0),
  min_quantity numeric(14,3) not null default 0 check (min_quantity >= 0),
  shortage numeric(14,3) generated always as (greatest(min_quantity - current_quantity, 0)) stored,
  quantity numeric(14,3) not null default 1 check (quantity >= 0),
  unit text not null default '' check (length(unit) <= 40),
  reported_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'ordered', 'received')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text not null default '' check (length(notes) <= 500),
  category text not null default 'أخرى' check (length(btrim(category)) between 1 and 80),
  image_url text,
  customer_name text,
  customer_phone text,
  version bigint not null default 1 check (version > 0),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists shortage_categories_shop_name_idx on public.shortage_categories(shop_id, lower(name)) where deleted_at is null;
create index if not exists shortage_items_shop_date_idx on public.shortage_items(shop_id, reported_at desc, id desc) where deleted_at is null;
create index if not exists shortage_items_shop_status_idx on public.shortage_items(shop_id, status) where deleted_at is null;

alter table public.shortage_categories enable row level security;
alter table public.shortage_categories force row level security;
alter table public.shortage_items enable row level security;
alter table public.shortage_items force row level security;

drop policy if exists shortage_categories_supervisor_read on public.shortage_categories;
drop policy if exists shortage_categories_supervisor_insert on public.shortage_categories;
drop policy if exists shortage_categories_supervisor_update on public.shortage_categories;
drop policy if exists shortage_categories_supervisor_delete on public.shortage_categories;
drop policy if exists shortage_items_supervisor_read on public.shortage_items;
drop policy if exists shortage_items_supervisor_insert on public.shortage_items;
drop policy if exists shortage_items_supervisor_update on public.shortage_items;
drop policy if exists shortage_items_supervisor_delete on public.shortage_items;

create policy shortage_categories_supervisor_read on public.shortage_categories for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_categories_supervisor_insert on public.shortage_categories for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_categories_supervisor_update on public.shortage_categories for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_categories_supervisor_delete on public.shortage_categories for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create policy shortage_items_supervisor_read on public.shortage_items for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_items_supervisor_insert on public.shortage_items for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_items_supervisor_update on public.shortage_items for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortage_items_supervisor_delete on public.shortage_items for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

create or replace function public.shortage_touch_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;
drop trigger if exists shortage_categories_touch_updated_at on public.shortage_categories;
drop trigger if exists shortage_items_touch_updated_at on public.shortage_items;
create trigger shortage_categories_touch_updated_at before update on public.shortage_categories for each row execute function public.shortage_touch_updated_at();
create trigger shortage_items_touch_updated_at before update on public.shortage_items for each row execute function public.shortage_touch_updated_at();

delete from public.shortage_categories where deleted_at is not null;
insert into public.shortage_categories (shop_id, name, icon)
select s.id, defaults.name, defaults.icon
from public.shops s
cross join (values
  ('منظفات', '🧴'),
  ('مستحضرات تجميل', '💄'),
  ('أدوات منزلية', '🧰'),
  ('ورقيات وخامات', '📦')
) as defaults(name, icon)
where not exists (
  select 1 from public.shortage_categories c
  where c.shop_id = s.id and lower(c.name) = lower(defaults.name) and c.deleted_at is null
);

revoke all on public.shortage_categories, public.shortage_items from public, anon, authenticated;
grant select, insert, update, delete on public.shortage_categories, public.shortage_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shortages-images', 'shortages-images', true, 10485760, array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do update set public = true, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists shortages_images_public_read on storage.objects;
drop policy if exists shortages_images_authenticated_insert on storage.objects;
drop policy if exists shortages_images_authenticated_update on storage.objects;
drop policy if exists shortages_images_authenticated_delete on storage.objects;
create policy shortages_images_public_read on storage.objects for select to public
  using (bucket_id = 'shortages-images');
create policy shortages_images_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shortages-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortages_images_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'shortages-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]))
  with check (bucket_id = 'shortages-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy shortages_images_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shortages-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]));

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shortage_items') then
    alter publication supabase_realtime add table public.shortage_items;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shortage_categories') then
    alter publication supabase_realtime add table public.shortage_categories;
  end if;
end;
$$;
alter table public.shortage_items replica identity full;
alter table public.shortage_categories replica identity full;

commit;
