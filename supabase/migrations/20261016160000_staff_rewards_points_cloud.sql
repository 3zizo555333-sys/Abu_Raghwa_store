begin;

create table if not exists public.store_rewards (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  title text not null check (length(trim(title)) between 1 and 180),
  description text,
  points_required integer not null check (points_required > 0),
  available_quantity integer not null default 1 check (available_quantity >= 0),
  icon text,
  created_at timestamptz not null default now(),
  constraint store_rewards_store_id_uuid_check check (store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
);

create table if not exists public.staff_points_ledger (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  employee_id uuid not null,
  points_delta integer not null check (points_delta <> 0),
  entry_type text not null check (entry_type in ('task_earned','penalty','reward_redeemed','manual_adjustment','reset')),
  source_id text not null,
  description text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint staff_points_ledger_store_id_uuid_check check (store_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'),
  constraint staff_points_ledger_source_unique unique (store_id, source_id)
);

create index if not exists store_rewards_store_points_idx on public.store_rewards (store_id, points_required, created_at);
create index if not exists staff_points_ledger_store_employee_created_idx on public.staff_points_ledger (store_id, employee_id, created_at desc);

alter table public.store_rewards enable row level security;
alter table public.store_rewards force row level security;
alter table public.staff_points_ledger enable row level security;
alter table public.staff_points_ledger force row level security;

revoke all on table public.store_rewards, public.staff_points_ledger from public, anon;
grant select on table public.store_rewards, public.staff_points_ledger to authenticated;
grant insert, update, delete on table public.store_rewards to authenticated;

drop policy if exists store_rewards_manager_select on public.store_rewards;
drop policy if exists store_rewards_manager_insert on public.store_rewards;
drop policy if exists store_rewards_manager_update on public.store_rewards;
drop policy if exists store_rewards_manager_delete on public.store_rewards;
create policy store_rewards_manager_select on public.store_rewards for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy store_rewards_manager_insert on public.store_rewards for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy store_rewards_manager_update on public.store_rewards for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy store_rewards_manager_delete on public.store_rewards for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

create policy staff_points_manager_select on public.staff_points_ledger for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));

create or replace function public.award_completed_task_points(p_shop_id uuid, p_task_id uuid)
returns public.staff_points_ledger
language plpgsql security definer set search_path = '' as $$
declare
  v_task public.store_tasks%rowtype;
  v_row public.staff_points_ledger%rowtype;
  v_actor uuid := auth.uid();
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception 'not authorized';
  end if;
  select * into v_task from public.store_tasks where id = p_task_id and store_id = p_shop_id::text for update;
  if not found then raise exception 'task not found'; end if;
  if v_task.assigned_to is null or v_task.points_value <= 0 then raise exception 'task has no employee points'; end if;
  if v_task.status <> 'completed' then raise exception 'task is not completed'; end if;
  if v_task.points_awarded then
    select * into v_row from public.staff_points_ledger where store_id = p_shop_id::text and source_id = 'task:' || p_task_id::text;
    return v_row;
  end if;
  insert into public.staff_points_ledger(store_id, employee_id, points_delta, entry_type, source_id, description, created_by)
    values (p_shop_id::text, v_task.assigned_to::uuid, v_task.points_value, 'task_earned', 'task:' || p_task_id::text,
            'إكمال المهمة: ' || v_task.title, v_actor)
    returning * into v_row;
  update public.store_tasks set points_awarded = true, updated_at = now() where id = p_task_id;
  return v_row;
end;
$$;

create or replace function public.apply_staff_point_adjustment(p_shop_id uuid, p_employee_id uuid, p_points_delta integer, p_entry_type text, p_source_id text, p_description text)
returns public.staff_points_ledger
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.staff_points_ledger%rowtype;
  v_actor uuid := auth.uid();
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception 'not authorized'; end if;
  if p_entry_type not in ('penalty','manual_adjustment','reset') or p_points_delta = 0 then raise exception 'invalid point adjustment'; end if;
  if not exists (select 1 from public.staff_employees where id = p_employee_id and shop_id = p_shop_id and deleted_at is null) then raise exception 'employee not found'; end if;
  insert into public.staff_points_ledger(store_id, employee_id, points_delta, entry_type, source_id, description, created_by)
    values (p_shop_id::text, p_employee_id, p_points_delta, p_entry_type, p_source_id, coalesce(p_description, ''), v_actor)
    on conflict (store_id, source_id) do update set source_id = excluded.source_id
    returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.redeem_staff_reward(p_shop_id uuid, p_employee_id uuid, p_reward_id uuid)
returns public.staff_points_ledger
language plpgsql security definer set search_path = '' as $$
declare
  v_reward public.store_rewards%rowtype;
  v_balance integer;
  v_row public.staff_points_ledger%rowtype;
  v_source text := 'reward:' || p_reward_id::text || ':employee:' || p_employee_id::text || ':' || gen_random_uuid()::text;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then raise exception 'not authorized'; end if;
  select * into v_reward from public.store_rewards where id = p_reward_id and store_id = p_shop_id::text for update;
  if not found or v_reward.available_quantity <= 0 then raise exception 'reward unavailable'; end if;
  select coalesce(sum(points_delta), 0) into v_balance from public.staff_points_ledger where store_id = p_shop_id::text and employee_id = p_employee_id;
  if v_balance < v_reward.points_required then raise exception 'insufficient points'; end if;
  insert into public.staff_points_ledger(store_id, employee_id, points_delta, entry_type, source_id, description, created_by)
    values (p_shop_id::text, p_employee_id, -v_reward.points_required, 'reward_redeemed', v_source, 'استلام الجائزة: ' || v_reward.title, auth.uid())
    returning * into v_row;
  update public.store_rewards set available_quantity = available_quantity - 1 where id = p_reward_id;
  return v_row;
end;
$$;

revoke all on function public.award_completed_task_points(uuid, uuid), public.apply_staff_point_adjustment(uuid, uuid, integer, text, text, text), public.redeem_staff_reward(uuid, uuid, uuid) from public, anon;
grant execute on function public.award_completed_task_points(uuid, uuid), public.apply_staff_point_adjustment(uuid, uuid, integer, text, text, text), public.redeem_staff_reward(uuid, uuid, uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='store_rewards') then execute 'alter publication supabase_realtime add table public.store_rewards'; end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='staff_points_ledger') then execute 'alter publication supabase_realtime add table public.staff_points_ledger'; end if;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
