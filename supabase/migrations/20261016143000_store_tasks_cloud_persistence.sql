begin;

create table if not exists public.store_tasks (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  title text not null,
  description text,
  priority text,
  status text not null default 'pending',
  due_date date,
  assigned_to text,
  points_value integer not null default 0,
  points_awarded boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint store_tasks_store_id_uuid_check check (store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  constraint store_tasks_title_check check (length(trim(title)) between 1 and 240),
  constraint store_tasks_priority_check check (priority is null or priority in ('low','medium','high')),
  constraint store_tasks_status_check check (status in ('pending','in_progress','completed')),
  constraint store_tasks_points_value_check check (points_value >= 0)
);

create index if not exists store_tasks_store_status_created_idx
  on public.store_tasks (store_id, status, created_at desc);
create index if not exists store_tasks_store_assigned_idx
  on public.store_tasks (store_id, assigned_to);

alter table public.store_tasks enable row level security;
alter table public.store_tasks force row level security;
revoke all on table public.store_tasks from public, anon;
grant select, insert, update, delete on table public.store_tasks to authenticated;

drop policy if exists store_tasks_manager_select on public.store_tasks;
drop policy if exists store_tasks_manager_insert on public.store_tasks;
drop policy if exists store_tasks_manager_update on public.store_tasks;
drop policy if exists store_tasks_manager_delete on public.store_tasks;

create policy store_tasks_manager_select on public.store_tasks
  for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy store_tasks_manager_insert on public.store_tasks
  for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy store_tasks_manager_update on public.store_tasks
  for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy store_tasks_manager_delete on public.store_tasks
  for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_tasks'
     ) then
    execute 'alter publication supabase_realtime add table public.store_tasks';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
