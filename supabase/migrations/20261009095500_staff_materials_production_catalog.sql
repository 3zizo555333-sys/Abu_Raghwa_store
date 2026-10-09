begin;

create table public.staff_employees (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 180),
  phone text not null default '' check (length(phone) <= 40),
  position text not null default '',
  salary numeric(18,4) not null default 0 check (salary >= 0),
  join_date date not null default current_date,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  employee_id uuid not null,
  attendance_date date not null,
  check_in timestamptz,
  check_out timestamptz,
  status text not null default 'present' check (status in ('present', 'absent', 'late', 'leave')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, employee_id, attendance_date),
  foreign key (employee_id, shop_id) references public.staff_employees(id, shop_id) on delete cascade
);

create table public.staff_withdrawals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  employee_id uuid not null,
  amount numeric(18,4) not null check (amount > 0),
  description text not null check (length(btrim(description)) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (employee_id, shop_id) references public.staff_employees(id, shop_id) on delete cascade
);

create table public.raw_materials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 180),
  supplier text not null default '',
  unit text not null default 'كيلو',
  total_weight numeric(18,6) not null default 0 check (total_weight >= 0),
  quantity numeric(18,6) not null default 0 check (quantity >= 0),
  total_price numeric(18,4) not null default 0 check (total_price >= 0),
  wholesale_price numeric(18,4) not null default 0 check (wholesale_price >= 0),
  price_per_kilo numeric(18,6) not null default 0 check (price_per_kilo >= 0),
  description text not null default '',
  usage text not null default '',
  ratio text not null default '',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.production_runs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  recipe_id uuid,
  recipe_name text not null,
  quantity numeric(18,6) not null check (quantity > 0),
  status text not null default 'completed' check (status in ('pending', 'completed', 'cancelled')),
  produced_at timestamptz not null default now(),
  notes text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.catalog_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  setting_key text not null check (length(btrim(setting_key)) between 1 and 120),
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, setting_key)
);

create table public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.catalog_companies (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id)
);

create table public.catalog_manual_products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  category_id uuid,
  company_id uuid,
  name text not null check (length(btrim(name)) between 1 and 180),
  unit text not null default 'قطعة',
  price numeric(18,4) not null default 0 check (price >= 0),
  description text not null default '',
  details_url text not null default '',
  loyalty_points integer not null default 0 check (loyalty_points >= 0),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, shop_id),
  foreign key (category_id, shop_id) references public.catalog_categories(id, shop_id) on delete set null,
  foreign key (company_id, shop_id) references public.catalog_companies(id, shop_id) on delete set null
);

create index staff_employees_shop_active_idx on public.staff_employees(shop_id, is_active) where deleted_at is null;
create unique index staff_employees_shop_name_idx on public.staff_employees(shop_id, lower(name)) where deleted_at is null;
create index staff_attendance_shop_date_idx on public.staff_attendance(shop_id, attendance_date desc);
create index staff_withdrawals_shop_status_idx on public.staff_withdrawals(shop_id, status, requested_at desc);
create index raw_materials_shop_name_idx on public.raw_materials(shop_id, lower(name)) where deleted_at is null;
create index production_runs_shop_date_idx on public.production_runs(shop_id, produced_at desc);
create index catalog_settings_shop_key_idx on public.catalog_settings(shop_id, setting_key);
create unique index catalog_categories_shop_name_idx on public.catalog_categories(shop_id, lower(name)) where deleted_at is null;
create unique index catalog_companies_shop_name_idx on public.catalog_companies(shop_id, lower(name)) where deleted_at is null;
create index catalog_manual_products_shop_visible_idx on public.catalog_manual_products(shop_id, is_visible) where deleted_at is null;

alter table public.staff_employees enable row level security;
alter table public.staff_employees force row level security;
alter table public.staff_attendance enable row level security;
alter table public.staff_attendance force row level security;
alter table public.staff_withdrawals enable row level security;
alter table public.staff_withdrawals force row level security;
alter table public.raw_materials enable row level security;
alter table public.raw_materials force row level security;
alter table public.production_runs enable row level security;
alter table public.production_runs force row level security;
alter table public.catalog_settings enable row level security;
alter table public.catalog_settings force row level security;
alter table public.catalog_categories enable row level security;
alter table public.catalog_categories force row level security;
alter table public.catalog_companies enable row level security;
alter table public.catalog_companies force row level security;
alter table public.catalog_manual_products enable row level security;
alter table public.catalog_manual_products force row level security;

do $$
declare v_table text;
begin
  foreach v_table in array array['staff_employees','staff_attendance','staff_withdrawals','raw_materials','production_runs','catalog_settings','catalog_categories','catalog_companies','catalog_manual_products'] loop
    execute format('create policy %I_member_read on public.%I for select to authenticated using (public.is_shop_member(shop_id))', v_table, v_table);
    execute format('create policy %I_manager_insert on public.%I for insert to authenticated with check (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[]))', v_table, v_table);
    execute format('create policy %I_manager_update on public.%I for update to authenticated using (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[])) with check (public.has_shop_role(shop_id, array[''manager'',''admin'',''supervisor'']::public.shop_role[]))', v_table, v_table);
  end loop;
end;
$$;

create trigger staff_employees_touch_updated_at before update on public.staff_employees for each row execute function public.touch_updated_at();
create trigger staff_attendance_touch_updated_at before update on public.staff_attendance for each row execute function public.touch_updated_at();
create trigger staff_withdrawals_touch_updated_at before update on public.staff_withdrawals for each row execute function public.touch_updated_at();
create trigger raw_materials_touch_updated_at before update on public.raw_materials for each row execute function public.touch_updated_at();
create trigger production_runs_touch_updated_at before update on public.production_runs for each row execute function public.touch_updated_at();
create trigger catalog_settings_touch_updated_at before update on public.catalog_settings for each row execute function public.touch_updated_at();
create trigger catalog_categories_touch_updated_at before update on public.catalog_categories for each row execute function public.touch_updated_at();
create trigger catalog_companies_touch_updated_at before update on public.catalog_companies for each row execute function public.touch_updated_at();
create trigger catalog_manual_products_touch_updated_at before update on public.catalog_manual_products for each row execute function public.touch_updated_at();

do $$
declare v_table text;
begin
  foreach v_table in array array['staff_employees','staff_attendance','staff_withdrawals','raw_materials','production_runs','catalog_settings','catalog_categories','catalog_companies','catalog_manual_products'] loop
    execute format('create trigger %I_emit_event after insert or update or delete on public.%I for each row execute function public.emit_shop_change_event()', v_table, v_table);
  end loop;
end;
$$;

revoke all on public.staff_employees, public.staff_attendance, public.staff_withdrawals, public.raw_materials, public.production_runs, public.catalog_settings, public.catalog_categories, public.catalog_companies, public.catalog_manual_products from public, anon, authenticated;
grant select, insert, update on public.staff_employees, public.staff_attendance, public.staff_withdrawals, public.raw_materials, public.production_runs, public.catalog_settings, public.catalog_categories, public.catalog_companies, public.catalog_manual_products to authenticated;

do $$
declare v_table text;
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['staff_employees','staff_attendance','staff_withdrawals','raw_materials','production_runs','catalog_settings','catalog_categories','catalog_companies','catalog_manual_products'] loop
      if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_table) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;

commit;
