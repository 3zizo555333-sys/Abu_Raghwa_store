begin;

create extension if not exists pgcrypto with schema extensions;

create table public.shop_feature_locks (
  shop_id uuid not null references public.shops(id) on delete cascade,
  feature_key text not null check (feature_key = any (array[
    'expenses','settings','employees','materials','suppliers','backup','financial_reports'
  ]::text[])),
  enabled boolean not null default false,
  pin_scope text not null default 'shared' check (pin_scope in ('shared','custom')),
  pin_configured boolean not null default false,
  shared_pin_configured boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, feature_key)
);
create index shop_feature_locks_shop_idx on public.shop_feature_locks(shop_id, feature_key);

-- Hashes are isolated from the realtime-readable feature status table.
create table public.shop_feature_lock_secrets (
  shop_id uuid not null references public.shops(id) on delete cascade,
  feature_key text not null check (feature_key = any (array[
    '__shared__','expenses','settings','employees','materials','suppliers','backup','financial_reports'
  ]::text[])),
  pin_hash text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (shop_id, feature_key)
);

create table public.shop_feature_lock_attempts (
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  feature_key text not null check (feature_key = any (array[
    'expenses','settings','employees','materials','suppliers','backup','financial_reports'
  ]::text[])),
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  primary key (shop_id, user_id, feature_key)
);

alter table public.shop_feature_locks enable row level security;
alter table public.shop_feature_locks force row level security;
alter table public.shop_feature_lock_secrets enable row level security;
alter table public.shop_feature_lock_secrets force row level security;
alter table public.shop_feature_lock_attempts enable row level security;
alter table public.shop_feature_lock_attempts force row level security;

create policy shop_feature_locks_member_read on public.shop_feature_locks for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor','seller']::public.shop_role[]));
grant select on public.shop_feature_locks to authenticated;
revoke insert, update, delete, truncate, references, trigger on public.shop_feature_locks from anon, authenticated;
revoke all on public.shop_feature_lock_secrets, public.shop_feature_lock_attempts from public, anon, authenticated;

create or replace function public.seed_shop_feature_locks_for_new_shop()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  foreach v_key in array array['expenses','settings','employees','materials','suppliers','backup','financial_reports'] loop
    insert into public.shop_feature_locks(shop_id, feature_key) values (new.id, v_key) on conflict do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.seed_shop_feature_locks_for_new_shop() from public, anon, authenticated;

insert into public.shop_feature_locks(shop_id, feature_key)
select s.id, feature_keys.feature_key
from public.shops s
cross join unnest(array['expenses','settings','employees','materials','suppliers','backup','financial_reports']::text[]) as feature_keys(feature_key)
on conflict (shop_id, feature_key) do nothing;

create trigger shops_seed_feature_locks
after insert on public.shops
for each row execute function public.seed_shop_feature_locks_for_new_shop();

create or replace function public.set_shop_feature_lock_pin(p_shop_id uuid, p_pin_scope text, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_secret_key text;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_MANAGER_REQUIRED';
  end if;
  if p_pin_scope is null or p_pin is null or p_pin !~ '^[0-9]{4}([0-9]{2})?$' then
    raise exception using errcode = '22023', message = 'FEATURE_LOCK_PIN_MUST_BE_4_OR_6_DIGITS';
  end if;
  if p_pin_scope = 'shared' then
    v_secret_key := '__shared__';
  elsif p_pin_scope = any (array['expenses','settings','employees','materials','suppliers','backup','financial_reports']::text[]) then
    v_secret_key := p_pin_scope;
  else
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_PIN_SCOPE';
  end if;

  insert into public.shop_feature_lock_secrets(shop_id, feature_key, pin_hash, updated_by, updated_at)
  values (p_shop_id, v_secret_key, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), auth.uid(), now())
  on conflict (shop_id, feature_key) do update
    set pin_hash = excluded.pin_hash, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  if p_pin_scope = 'shared' then
    update public.shop_feature_locks
      set shared_pin_configured = true,
          pin_configured = case when pin_scope = 'shared' then true else pin_configured end,
          updated_by = auth.uid(), updated_at = now()
      where shop_id = p_shop_id;
  else
    update public.shop_feature_locks
      set pin_scope = 'custom', pin_configured = true, updated_by = auth.uid(), updated_at = now()
      where shop_id = p_shop_id and feature_key = p_pin_scope;
  end if;
  return true;
end;
$$;

create or replace function public.set_shop_feature_lock(
  p_shop_id uuid, p_feature_key text, p_enabled boolean, p_pin_scope text default 'shared'
) returns public.shop_feature_locks
language plpgsql security definer set search_path = '' as $$
declare v_row public.shop_feature_locks; v_secret_key text; v_has_pin boolean; v_shared_pin boolean;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_MANAGER_REQUIRED';
  end if;
  if p_feature_key is null or p_feature_key <> all (array['expenses','settings','employees','materials','suppliers','backup','financial_reports']::text[])
     or p_pin_scope not in ('shared','custom') then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_CONFIGURATION';
  end if;
  v_secret_key := case when p_pin_scope = 'shared' then '__shared__' else p_feature_key end;
  select exists (select 1 from public.shop_feature_lock_secrets where shop_id=p_shop_id and feature_key=v_secret_key) into v_has_pin;
  select exists (select 1 from public.shop_feature_lock_secrets where shop_id=p_shop_id and feature_key='__shared__') into v_shared_pin;
  if p_enabled and not v_has_pin then
    raise exception using errcode = '22023', message = 'FEATURE_LOCK_PIN_REQUIRED';
  end if;

  insert into public.shop_feature_locks(shop_id, feature_key, enabled, pin_scope, pin_configured, shared_pin_configured, updated_by, updated_at)
  values (p_shop_id, p_feature_key, coalesce(p_enabled,false), p_pin_scope, v_has_pin, v_shared_pin, auth.uid(), now())
  on conflict (shop_id, feature_key) do update
    set enabled = excluded.enabled, pin_scope = excluded.pin_scope,
        pin_configured = excluded.pin_configured, shared_pin_configured = excluded.shared_pin_configured,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.verify_shop_feature_lock_pin(p_shop_id uuid, p_feature_key text, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_lock public.shop_feature_locks;
  v_user_id uuid := auth.uid();
  v_secret_key text;
  v_hash text;
  v_attempt public.shop_feature_lock_attempts;
  v_next_attempt smallint;
begin
  if v_user_id is null or not public.has_shop_role(p_shop_id, array['manager','admin','supervisor','seller']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_SHOP_MEMBERSHIP_REQUIRED';
  end if;
  if p_feature_key is null or p_feature_key <> all (array['expenses','settings','employees','materials','suppliers','backup','financial_reports']::text[]) then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_KEY';
  end if;
  select * into v_lock from public.shop_feature_locks where shop_id=p_shop_id and feature_key=p_feature_key;
  if not found or not v_lock.enabled then return true; end if;
  v_secret_key := case when v_lock.pin_scope = 'shared' then '__shared__' else p_feature_key end;
  select pin_hash into v_hash from public.shop_feature_lock_secrets where shop_id=p_shop_id and feature_key=v_secret_key;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text || ':' || v_user_id::text || ':' || p_feature_key, 0));
  insert into public.shop_feature_lock_attempts(shop_id,user_id,feature_key)
  values (p_shop_id,v_user_id,p_feature_key) on conflict do nothing;
  select * into v_attempt from public.shop_feature_lock_attempts
    where shop_id=p_shop_id and user_id=v_user_id and feature_key=p_feature_key for update;
  if v_attempt.blocked_until is not null and v_attempt.blocked_until > now() then return false; end if;
  if v_attempt.window_started_at < now() - interval '10 minutes' then
    update public.shop_feature_lock_attempts
      set attempt_count=0, window_started_at=now(), blocked_until=null
      where shop_id=p_shop_id and user_id=v_user_id and feature_key=p_feature_key
      returning * into v_attempt;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4}([0-9]{2})?$' and v_hash is not null
     and extensions.crypt(p_pin, v_hash) = v_hash then
    delete from public.shop_feature_lock_attempts where shop_id=p_shop_id and user_id=v_user_id and feature_key=p_feature_key;
    return true;
  end if;

  v_next_attempt := least(v_attempt.attempt_count + 1, 5);
  update public.shop_feature_lock_attempts
    set attempt_count=v_next_attempt,
        blocked_until=case when v_next_attempt >= 5 then now() + interval '30 seconds' else null end
    where shop_id=p_shop_id and user_id=v_user_id and feature_key=p_feature_key;
  return false;
end;
$$;

revoke all on function public.set_shop_feature_lock_pin(uuid,text,text) from public, anon;
revoke all on function public.set_shop_feature_lock(uuid,text,boolean,text) from public, anon;
revoke all on function public.verify_shop_feature_lock_pin(uuid,text,text) from public, anon;
grant execute on function public.set_shop_feature_lock_pin(uuid,text,text) to authenticated;
grant execute on function public.set_shop_feature_lock(uuid,text,boolean,text) to authenticated;
grant execute on function public.verify_shop_feature_lock_pin(uuid,text,text) to authenticated;

-- Realtime subscribers see only feature status; PIN hashes and attempt counters are never exposed.
do $$ begin
  alter publication supabase_realtime add table public.shop_feature_locks;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
