begin;

-- Snapshot storage is restricted to named legacy feature screens only; core business
-- ledgers remain normalized tables. Tenant scope is always shop_id.
create table if not exists public.shop_feature_state (
  shop_id uuid not null references public.shops(id) on delete cascade,
  feature_key text not null check (feature_key = any (array[
    'abu_raghwa_tasks','abu_raghwa_employees','points_system_employees',
    'abu_raghwa_penalty_rules','abu_raghwa_penalty_logs',
    'abu_raghwa_invoice_categories_v2','abu_raghwa_saved_offers','abu_reward_levels',
    'abu_raghwa_custom_strategies','abu_gift_delivery_logs',
    'abu_raghwa_scale_settings','abu_raghwa_custom_voice_commands'
  ]::text[])),
  payload jsonb not null default '[]'::jsonb check (octet_length(payload::text) <= 1048576),
  version bigint not null default 1 check (version > 0),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, feature_key)
);

alter table public.shop_feature_state enable row level security;
alter table public.shop_feature_state force row level security;

create or replace function public.can_manage_shop_feature_state(p_shop_id uuid, p_feature_key text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[])
    or (p_feature_key = any (array[
      'abu_raghwa_tasks','points_system_employees',
      'abu_raghwa_penalty_rules','abu_raghwa_penalty_logs','abu_raghwa_invoice_categories_v2'
    ]::text[]) and public.has_shop_role(p_shop_id, array['supervisor']::public.shop_role[]));
$$;
revoke all on function public.can_manage_shop_feature_state(uuid,text) from public, anon;
grant execute on function public.can_manage_shop_feature_state(uuid,text) to authenticated;

create policy shop_feature_state_manager_read on public.shop_feature_state for select to authenticated
  using (public.can_manage_shop_feature_state(shop_id, feature_key));
create policy shop_feature_state_manager_insert on public.shop_feature_state for insert to authenticated
  with check (public.can_manage_shop_feature_state(shop_id, feature_key));
create policy shop_feature_state_manager_update on public.shop_feature_state for update to authenticated
  using (public.can_manage_shop_feature_state(shop_id, feature_key))
  with check (public.can_manage_shop_feature_state(shop_id, feature_key));
create policy shop_feature_state_manager_delete on public.shop_feature_state for delete to authenticated
  using (public.can_manage_shop_feature_state(shop_id, feature_key));
grant select, insert, update, delete on public.shop_feature_state to authenticated;
revoke all on public.shop_feature_state from anon, public;

create or replace function public.save_shop_feature_state(
  p_shop_id uuid, p_feature_key text, p_payload jsonb, p_expected_version bigint default null
) returns public.shop_feature_state
language plpgsql security invoker set search_path = '' as $$
declare v_row public.shop_feature_state;
begin
  if p_payload is null or octet_length(p_payload::text) > 1048576 then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_STATE';
  end if;
  if not public.can_manage_shop_feature_state(p_shop_id, p_feature_key) then
    raise exception using errcode = '42501', message = 'FEATURE_STATE_FORBIDDEN';
  end if;

  if p_expected_version is null then
    insert into public.shop_feature_state(shop_id, feature_key, payload, updated_by)
    values (p_shop_id, p_feature_key, p_payload, (select auth.uid()))
    on conflict (shop_id, feature_key) do nothing returning * into v_row;
  else
    update public.shop_feature_state
      set payload = p_payload, version = version + 1, updated_by = (select auth.uid()), updated_at = now()
      where shop_id = p_shop_id and feature_key = p_feature_key and version = p_expected_version
      returning * into v_row;
  end if;
  if not found then raise exception using errcode = '40001', message = 'FEATURE_STATE_VERSION_CONFLICT'; end if;
  return v_row;
end;
$$;
revoke all on function public.save_shop_feature_state(uuid,text,jsonb,bigint) from public, anon;
grant execute on function public.save_shop_feature_state(uuid,text,jsonb,bigint) to authenticated;

create trigger shop_feature_state_touch_updated_at before update on public.shop_feature_state
  for each row execute function public.touch_updated_at();
create trigger shop_feature_state_emit_event after insert or update or delete on public.shop_feature_state
  for each row execute function public.emit_shop_change_event();

-- Normalized customer-credit and supplier ledgers; balances are derived from immutable entries.
create table if not exists public.shop_credit_accounts (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  party_type text not null check (party_type in ('customer','supplier')),
  name text not null check (length(btrim(name)) between 1 and 200),
  phone text not null default '' check (length(phone) <= 80),
  notes text not null default '' check (length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  legacy_source_id text check (legacy_source_id is null or length(legacy_source_id) between 1 and 80),
  unique (shop_id, party_type, legacy_source_id),
  unique (id, shop_id)
);
create index if not exists shop_credit_accounts_shop_type_idx on public.shop_credit_accounts(shop_id, party_type, name) where deleted_at is null;

create table if not exists public.shop_credit_transactions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  account_id uuid not null,
  entry_type text not null check (entry_type in ('opening','purchase','payment','return','adjustment')),
  amount numeric(18,4) not null check (amount > 0),
  balance_delta numeric(18,4) not null check (balance_delta <> 0),
  description text not null check (length(btrim(description)) between 1 and 500),
  notes text not null default '' check (length(notes) <= 1000),
  occurred_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  legacy_source_id text check (legacy_source_id is null or length(legacy_source_id) between 1 and 100),
  unique (shop_id, account_id, legacy_source_id),
  foreign key (account_id, shop_id) references public.shop_credit_accounts(id, shop_id) on delete cascade
);
create index if not exists shop_credit_transactions_shop_account_date_idx on public.shop_credit_transactions(shop_id, account_id, occurred_at desc, id desc);

alter table public.shop_credit_accounts enable row level security;
alter table public.shop_credit_accounts force row level security;
alter table public.shop_credit_transactions enable row level security;
alter table public.shop_credit_transactions force row level security;
create policy shop_credit_accounts_manager_read on public.shop_credit_accounts for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]) and deleted_at is null);
create policy shop_credit_accounts_manager_insert on public.shop_credit_accounts for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
create policy shop_credit_accounts_manager_update on public.shop_credit_accounts for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
create policy shop_credit_transactions_manager_read on public.shop_credit_transactions for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
create policy shop_credit_transactions_manager_insert on public.shop_credit_transactions for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
grant select, insert, update on public.shop_credit_accounts to authenticated;
grant select, insert on public.shop_credit_transactions to authenticated;
revoke all on public.shop_credit_accounts, public.shop_credit_transactions from anon, public;
create trigger shop_credit_accounts_touch_updated_at before update on public.shop_credit_accounts
  for each row execute function public.touch_updated_at();
create trigger shop_credit_accounts_emit_event after insert or update or delete on public.shop_credit_accounts
  for each row execute function public.emit_shop_change_event();
create trigger shop_credit_transactions_immutable before update or delete on public.shop_credit_transactions
  for each row execute function public.prevent_ledger_mutation();
create trigger shop_credit_transactions_emit_event after insert or update or delete on public.shop_credit_transactions
  for each row execute function public.emit_shop_change_event();

create or replace function public.create_shop_credit_account(
  p_shop_id uuid, p_party_type text, p_name text, p_phone text default '', p_notes text default '',
  p_initial_balance numeric default 0, p_initial_description text default 'رصيد افتتاحي'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_account public.shop_credit_accounts; v_entry public.shop_credit_transactions;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'CREDIT_ACCOUNT_FORBIDDEN';
  end if;
  if p_party_type not in ('customer','supplier') or length(btrim(coalesce(p_name,''))) not between 1 and 200
     or abs(coalesce(p_initial_balance,0)) > 999999999999.9999 then
    raise exception using errcode = '22023', message = 'INVALID_CREDIT_ACCOUNT';
  end if;
  insert into public.shop_credit_accounts(shop_id,party_type,name,phone,notes)
  values (p_shop_id,p_party_type,btrim(p_name),coalesce(p_phone,''),coalesce(p_notes,'')) returning * into v_account;
  if coalesce(p_initial_balance,0) <> 0 then
    insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description)
    values (p_shop_id,v_account.id,'opening',abs(p_initial_balance),p_initial_balance,
      coalesce(nullif(btrim(p_initial_description),''),'رصيد افتتاحي')) returning * into v_entry;
  end if;
  return jsonb_build_object('account',to_jsonb(v_account),'opening',case when v_entry.id is null then null else to_jsonb(v_entry) end);
end;
$$;

create or replace function public.append_shop_credit_transaction(
  p_shop_id uuid, p_account_id uuid, p_entry_type text, p_amount numeric, p_balance_delta numeric,
  p_description text, p_notes text default '', p_occurred_at timestamptz default now()
) returns public.shop_credit_transactions language plpgsql security invoker set search_path = '' as $$
declare v_entry public.shop_credit_transactions;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'CREDIT_TRANSACTION_FORBIDDEN';
  end if;
  if p_entry_type not in ('purchase','payment','return','adjustment') or p_amount is null or p_amount <= 0
     or p_amount > 999999999999.9999 or p_balance_delta is null or p_balance_delta = 0
     or abs(p_balance_delta) <> p_amount or length(btrim(coalesce(p_description,''))) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_CREDIT_TRANSACTION';
  end if;
  insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description,notes,occurred_at)
  values (p_shop_id,p_account_id,p_entry_type,p_amount,p_balance_delta,btrim(p_description),coalesce(p_notes,''),coalesce(p_occurred_at,now()))
  returning * into v_entry;
  return v_entry;
end;
$$;
revoke all on function public.create_shop_credit_account(uuid,text,text,text,text,numeric,text) from public, anon;
revoke all on function public.append_shop_credit_transaction(uuid,uuid,text,numeric,numeric,text,text,timestamptz) from public, anon;
grant execute on function public.create_shop_credit_account(uuid,text,text,text,text,numeric,text) to authenticated;
grant execute on function public.append_shop_credit_transaction(uuid,uuid,text,numeric,numeric,text,text,timestamptz) to authenticated;

create table public.shop_feature_migrations (
  shop_id uuid not null references public.shops(id) on delete cascade,
  migration_key text not null,
  applied_by uuid default auth.uid() references auth.users(id) on delete set null,
  applied_at timestamptz not null default now(),
  primary key (shop_id, migration_key)
);
alter table public.shop_feature_migrations enable row level security;
alter table public.shop_feature_migrations force row level security;
revoke all on public.shop_feature_migrations from public, anon, authenticated;

create or replace function public.import_legacy_shop_credit_accounts(p_shop_id uuid, p_customers jsonb, p_suppliers jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_list jsonb; v_party text; v_item jsonb; v_tx jsonb; v_account_id uuid;
  v_legacy_id text; v_tx_id text; v_type text; v_delta numeric; v_amount numeric;
  v_target numeric; v_current numeric; v_inserted_accounts integer := 0; v_inserted_transactions integer := 0;
  v_count integer := 0;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'CREDIT_MIGRATION_FORBIDDEN';
  end if;
  if jsonb_typeof(coalesce(p_customers,'[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_suppliers,'[]'::jsonb)) <> 'array'
     or octet_length(coalesce(p_customers,'[]'::jsonb)::text || coalesce(p_suppliers,'[]'::jsonb)::text) > 5000000 then
    raise exception using errcode = '22023', message = 'INVALID_CREDIT_MIGRATION_PAYLOAD';
  end if;
  insert into public.shop_feature_migrations(shop_id,migration_key)
  values (p_shop_id,'legacy-credit-ledger-v1') on conflict do nothing;

  foreach v_list slice 0 in array array[coalesce(p_customers,'[]'::jsonb),coalesce(p_suppliers,'[]'::jsonb)] loop
    v_party := case when v_count = 0 then 'customer' else 'supplier' end;
    if jsonb_array_length(v_list) > 1000 then raise exception using errcode = '22023', message = 'TOO_MANY_CREDIT_ACCOUNTS'; end if;
    for v_item in select value from jsonb_array_elements(v_list) loop
      v_legacy_id := left(coalesce(nullif(v_item->>'id',''),gen_random_uuid()::text),80);
      insert into public.shop_credit_accounts(shop_id,party_type,name,phone,notes,legacy_source_id)
      values (p_shop_id,v_party,left(coalesce(nullif(btrim(v_item->>'name'),''),'حساب مرحّل'),200),left(coalesce(v_item->>'phone',''),80),left(coalesce(v_item->>'notes',''),1000),v_legacy_id)
      on conflict (shop_id,party_type,legacy_source_id) do nothing returning id into v_account_id;
      if v_account_id is null then
        select id into v_account_id from public.shop_credit_accounts where shop_id=p_shop_id and party_type=v_party and legacy_source_id=v_legacy_id;
      else v_inserted_accounts := v_inserted_accounts + 1;
      end if;
      if jsonb_typeof(v_item->'transactions') = 'array' then
        if jsonb_array_length(v_item->'transactions') > 10000 then raise exception using errcode = '22023', message = 'TOO_MANY_CREDIT_TRANSACTIONS'; end if;
        for v_tx in select value from jsonb_array_elements(v_item->'transactions') with ordinality as t(value,ord) order by ord desc loop
          v_tx_id := left(coalesce(nullif(v_tx->>'id',''),gen_random_uuid()::text),100);
          v_type := case when v_tx->>'type' = 'payment' then 'payment' when v_tx->>'type' = 'return' then 'return' else 'purchase' end;
          v_amount := abs(coalesce(nullif(v_tx->>'amount','')::numeric,0));
          if v_amount <= 0 then continue; end if;
          v_delta := case when v_type in ('payment','return') then -v_amount else v_amount end;
          insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description,notes,occurred_at,legacy_source_id)
          values (p_shop_id,v_account_id,v_type,v_amount,v_delta,left(coalesce(nullif(v_tx->>'description',''),'حركة مرحّلة'),500),left(coalesce(v_tx->>'notes',''),1000),coalesce(nullif(v_tx->>'date','')::timestamptz,now()),v_tx_id)
          on conflict (shop_id,account_id,legacy_source_id) do nothing;
          if found then v_inserted_transactions := v_inserted_transactions + 1; end if;
        end loop;
      end if;
      select coalesce(sum(balance_delta),0) into v_current from public.shop_credit_transactions where shop_id=p_shop_id and account_id=v_account_id;
      v_target := coalesce(nullif(v_item->>'balance','')::numeric,v_current);
      if v_target <> v_current then
        v_delta := v_target - v_current;
        insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description,legacy_source_id)
        values (p_shop_id,v_account_id,'adjustment',abs(v_delta),v_delta,'موازنة ترحيل الرصيد القديم','legacy-reconcile')
        on conflict (shop_id,account_id,legacy_source_id) do nothing;
        if found then v_inserted_transactions := v_inserted_transactions + 1; end if;
      end if;
    end loop;
    v_count := v_count + 1;
  end loop;
  return jsonb_build_object('imported',true,'accounts',v_inserted_accounts,'transactions',v_inserted_transactions);
end;
$$;
revoke all on function public.import_legacy_shop_credit_accounts(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.import_legacy_shop_credit_accounts(uuid,jsonb,jsonb) to authenticated;

-- Tasks are management/supervisor data, not a seller-visible global list.
drop policy if exists tasks_member_read on public.tasks;
create policy tasks_manager_supervisor_read on public.tasks for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
create policy tasks_manager_supervisor_insert on public.tasks for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy tasks_manager_supervisor_update on public.tasks for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy tasks_manager_supervisor_delete on public.tasks for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
grant select, insert, update, delete on public.tasks to authenticated;

-- Employee directory and private financial expense details are not seller-readable.
drop policy if exists staff_employees_member_read on public.staff_employees;
drop policy if exists staff_employees_manager_supervisor_read on public.staff_employees;
create policy staff_employees_manager_read on public.staff_employees for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]) and deleted_at is null);
drop policy if exists staff_employees_manager_insert on public.staff_employees;
drop policy if exists staff_employees_manager_update on public.staff_employees;
create policy staff_employees_manager_insert on public.staff_employees for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
create policy staff_employees_manager_update on public.staff_employees for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

drop policy if exists expenses_manager_read on public.expenses;
create policy expenses_manager_read on public.expenses for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]) and deleted_at is null);
grant select on public.shop_feature_state, public.shop_credit_accounts, public.shop_credit_transactions to authenticated;

create or replace function public.list_task_staff_directory(p_shop_id uuid)
returns table(id uuid, name text, role text)
language sql stable security definer set search_path = '' as $$
  select e.id, e.name, e.role::text
  from public.staff_employees e
  where e.shop_id = p_shop_id and e.deleted_at is null and e.is_active
    and public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[])
  order by e.name, e.id;
$$;
revoke all on function public.list_task_staff_directory(uuid) from public, anon;
grant execute on function public.list_task_staff_directory(uuid) to authenticated;

-- Realtime subscriptions are tenant-filtered in the client. Add this table idempotently.
do $$ begin
  alter publication supabase_realtime add table public.shop_feature_state;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
