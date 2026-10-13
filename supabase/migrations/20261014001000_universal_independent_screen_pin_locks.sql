begin;

-- The pre-route lock model allowed a shared PIN. Remove that model entirely:
-- every internal route gets a dedicated lock row and a dedicated bcrypt hash.
alter table public.shop_feature_locks drop constraint if exists shop_feature_locks_feature_key_check;
alter table public.shop_feature_lock_secrets drop constraint if exists shop_feature_lock_secrets_feature_key_check;
alter table public.shop_feature_lock_attempts drop constraint if exists shop_feature_lock_attempts_feature_key_check;
alter table public.shop_feature_locks drop constraint if exists shop_feature_locks_pin_scope_check;

-- Old feature-level/shared settings cannot be copied to route keys without reusing
-- one PIN across screens. Clear prior lock state and require independent enrollment.
delete from public.shop_feature_lock_secrets;
delete from public.shop_feature_lock_attempts;
delete from public.shop_feature_locks;

-- A per-shop secret key produces a private HMAC fingerprint, rejecting the same
-- numeric PIN being assigned to two screens without exposing hashes to clients.
create table public.shop_feature_lock_peppers (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  pepper text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.shop_feature_lock_peppers enable row level security;
alter table public.shop_feature_lock_peppers force row level security;
revoke all on public.shop_feature_lock_peppers from public, anon, authenticated;

alter table public.shop_feature_lock_secrets add column pin_fingerprint text not null;
create unique index shop_feature_lock_secrets_unique_pin_per_shop
  on public.shop_feature_lock_secrets(shop_id, pin_fingerprint);

alter table public.shop_feature_locks drop column if exists pin_scope;
alter table public.shop_feature_locks drop column if exists shared_pin_configured;
alter table public.shop_feature_locks
  add constraint shop_feature_locks_feature_key_route_check
  check (feature_key ~ '^screen__[a-z0-9_]{1,112}$');
alter table public.shop_feature_lock_secrets
  add constraint shop_feature_lock_secrets_feature_key_route_check
  check (feature_key ~ '^screen__[a-z0-9_]{1,112}$');
alter table public.shop_feature_lock_attempts
  add constraint shop_feature_lock_attempts_feature_key_route_check
  check (feature_key ~ '^screen__[a-z0-9_]{1,112}$');

-- Stable route IDs mirror client/src/lib/supabase/screenPinRegistry.ts.
create or replace function public.shop_feature_pin_route_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array_agg(
    'screen__' || coalesce(
      nullif(trim(both '_' from regexp_replace(lower(route_path), '[^a-z0-9]+', '_', 'g')), ''),
      'root'
    )
    order by route_path
  )
  from unnest(array[
    '/', '/home', '/dashboard', '/products', '/sales', '/cashier', '/reports',
    '/advanced-reports', '/employees', '/tasks', '/points-system', '/offers',
    '/smart-offers', '/smart-offers-list', '/catalog-manager', '/voice',
    '/materials', '/recipes', '/calculator', '/invoice-ocr', '/invoice',
    '/returns', '/audit-log', '/inventory-alerts', '/recipe-production',
    '/data-export-import', '/recipes-display', '/advanced-search', '/settings',
    '/email-notifications', '/payment-gateway', '/user-management', '/expenses',
    '/checks', '/checks-page', '/suppliers', '/tasks-page', '/inventory',
    '/material-details/:id', '/invoice-camera', '/invoice-scanner',
    '/advanced-invoices', '/advanced-barcode', '/social-media', '/voice-control',
    '/notifications', '/notifications-advanced', '/apartment-management',
    '/leaderboard', '/credits-suppliers', '/shortages'
  ]::text[]) as paths(route_path);
$$;
revoke all on function public.shop_feature_pin_route_keys() from public, anon, authenticated;

-- Seed every existing store, and future stores, with off-by-default rows for the
-- complete staff-route registry. Missing PINs remain visibly unconfigured.
insert into public.shop_feature_locks(shop_id, feature_key, enabled, pin_configured)
select s.id, route_keys.feature_key, false, false
from public.shops s
cross join unnest(public.shop_feature_pin_route_keys()) as route_keys(feature_key)
on conflict (shop_id, feature_key) do nothing;

create or replace function public.seed_shop_feature_locks_for_new_shop()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_key text;
begin
  foreach v_key in array public.shop_feature_pin_route_keys() loop
    insert into public.shop_feature_locks(shop_id, feature_key, enabled, pin_configured)
    values (new.id, v_key, false, false)
    on conflict (shop_id, feature_key) do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function public.seed_shop_feature_locks_for_new_shop() from public, anon, authenticated;

-- Replace the former scope-based setter with a route-specific PIN setter.
drop function if exists public.set_shop_feature_lock_pin(uuid, text, text);
create function public.set_shop_feature_lock_pin(p_shop_id uuid, p_feature_key text, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_pepper text; v_pin_fingerprint text;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_MANAGER_REQUIRED';
  end if;
  if p_feature_key is null or p_feature_key !~ '^screen__[a-z0-9_]{1,112}$'
     or p_pin is null or p_pin !~ '^[0-9]{4}([0-9]{2})?$' then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_PIN_CONFIGURATION';
  end if;

  insert into public.shop_feature_lock_peppers(shop_id) values (p_shop_id) on conflict do nothing;
  select pepper into v_pepper from public.shop_feature_lock_peppers where shop_id = p_shop_id;
  v_pin_fingerprint := encode(extensions.hmac(convert_to(p_pin, 'UTF8'), convert_to(v_pepper, 'UTF8'), 'sha256'), 'hex');
  if exists (
    select 1 from public.shop_feature_lock_secrets
     where shop_id = p_shop_id and pin_fingerprint = v_pin_fingerprint and feature_key <> p_feature_key
  ) then
    raise exception using errcode = '22023', message = 'FEATURE_LOCK_PIN_MUST_BE_UNIQUE';
  end if;

  insert into public.shop_feature_lock_secrets(shop_id, feature_key, pin_hash, pin_fingerprint, updated_by, updated_at)
  values (p_shop_id, p_feature_key, extensions.crypt(p_pin, extensions.gen_salt('bf', 12)), v_pin_fingerprint, auth.uid(), now())
  on conflict (shop_id, feature_key) do update
    set pin_hash = excluded.pin_hash, pin_fingerprint = excluded.pin_fingerprint, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.shop_feature_locks(shop_id, feature_key, enabled, pin_configured, updated_by, updated_at)
  values (p_shop_id, p_feature_key, false, true, auth.uid(), now())
  on conflict (shop_id, feature_key) do update
    set pin_configured = true, updated_by = auth.uid(), updated_at = now();
  return true;
end;
$$;

-- Single-screen toggle. There is deliberately no PIN-scope/shared-PIN argument.
drop function if exists public.set_shop_feature_lock(uuid, text, boolean, text);
create function public.set_shop_feature_lock(p_shop_id uuid, p_feature_key text, p_enabled boolean)
returns public.shop_feature_locks
language plpgsql security definer set search_path = '' as $$
declare v_row public.shop_feature_locks; v_has_pin boolean;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_MANAGER_REQUIRED';
  end if;
  if p_feature_key is null or p_feature_key !~ '^screen__[a-z0-9_]{1,112}$' then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_KEY';
  end if;
  select exists (
    select 1 from public.shop_feature_lock_secrets
    where shop_id = p_shop_id and feature_key = p_feature_key
  ) into v_has_pin;
  if coalesce(p_enabled, false) and not v_has_pin then
    raise exception using errcode = '22023', message = 'FEATURE_LOCK_PIN_REQUIRED';
  end if;

  insert into public.shop_feature_locks(shop_id, feature_key, enabled, pin_configured, updated_by, updated_at)
  values (p_shop_id, p_feature_key, coalesce(p_enabled, false), v_has_pin, auth.uid(), now())
  on conflict (shop_id, feature_key) do update
    set enabled = excluded.enabled, pin_configured = v_has_pin,
        updated_by = auth.uid(), updated_at = now()
  returning * into v_row;
  return v_row;
end;
$$;

-- Bulk lock only enables rows with a PIN hash; missing PINs are returned to UI.
create or replace function public.set_all_shop_feature_locks(p_shop_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_missing text[]; v_enabled_count integer;
begin
  if not public.has_shop_role(p_shop_id, array['manager']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_MANAGER_REQUIRED';
  end if;
  select coalesce(array_agg(feature_key order by feature_key), '{}'::text[])
    into v_missing
    from public.shop_feature_locks
   where shop_id = p_shop_id and not pin_configured;

  update public.shop_feature_locks
     set enabled = case when coalesce(p_enabled, false) then pin_configured else false end,
         updated_by = auth.uid(), updated_at = now()
   where shop_id = p_shop_id;

  select count(*)::integer into v_enabled_count
    from public.shop_feature_locks where shop_id = p_shop_id and enabled;
  return jsonb_build_object(
    'enabled_count', v_enabled_count,
    'missing_keys', case when coalesce(p_enabled, false) then to_jsonb(v_missing) else '[]'::jsonb end
  );
end;
$$;

create or replace function public.verify_shop_feature_lock_pin(p_shop_id uuid, p_feature_key text, p_pin text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_lock public.shop_feature_locks;
  v_user_id uuid := auth.uid();
  v_hash text;
  v_attempt public.shop_feature_lock_attempts;
  v_next_attempt smallint;
begin
  if v_user_id is null or not public.has_shop_role(p_shop_id, array['manager','admin','supervisor','seller']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'FEATURE_LOCK_SHOP_MEMBERSHIP_REQUIRED';
  end if;
  if p_feature_key is null or p_feature_key !~ '^screen__[a-z0-9_]{1,112}$' then
    raise exception using errcode = '22023', message = 'INVALID_FEATURE_LOCK_KEY';
  end if;
  select * into v_lock from public.shop_feature_locks
   where shop_id = p_shop_id and feature_key = p_feature_key;
  if not found or not v_lock.enabled then return true; end if;

  -- The lookup is strictly keyed by this route; one screen's PIN cannot verify another.
  select pin_hash into v_hash from public.shop_feature_lock_secrets
   where shop_id = p_shop_id and feature_key = p_feature_key;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text || ':' || v_user_id::text || ':' || p_feature_key, 0));
  insert into public.shop_feature_lock_attempts(shop_id, user_id, feature_key)
  values (p_shop_id, v_user_id, p_feature_key) on conflict do nothing;
  select * into v_attempt from public.shop_feature_lock_attempts
   where shop_id = p_shop_id and user_id = v_user_id and feature_key = p_feature_key for update;
  if v_attempt.blocked_until is not null and v_attempt.blocked_until > now() then return false; end if;
  if v_attempt.window_started_at < now() - interval '10 minutes' then
    update public.shop_feature_lock_attempts
       set attempt_count = 0, window_started_at = now(), blocked_until = null
     where shop_id = p_shop_id and user_id = v_user_id and feature_key = p_feature_key
     returning * into v_attempt;
  end if;

  if p_pin is not null and p_pin ~ '^[0-9]{4}([0-9]{2})?$' and v_hash is not null
     and extensions.crypt(p_pin, v_hash) = v_hash then
    delete from public.shop_feature_lock_attempts
     where shop_id = p_shop_id and user_id = v_user_id and feature_key = p_feature_key;
    return true;
  end if;

  v_next_attempt := least(v_attempt.attempt_count + 1, 5);
  update public.shop_feature_lock_attempts
     set attempt_count = v_next_attempt,
         blocked_until = case when v_next_attempt >= 5 then now() + interval '30 seconds' else null end
   where shop_id = p_shop_id and user_id = v_user_id and feature_key = p_feature_key;
  return false;
end;
$$;

revoke all on function public.set_shop_feature_lock_pin(uuid, text, text) from public, anon;
revoke all on function public.set_shop_feature_lock(uuid, text, boolean) from public, anon;
revoke all on function public.set_all_shop_feature_locks(uuid, boolean) from public, anon;
revoke all on function public.verify_shop_feature_lock_pin(uuid, text, text) from public, anon;
grant execute on function public.set_shop_feature_lock_pin(uuid, text, text) to authenticated;
grant execute on function public.set_shop_feature_lock(uuid, text, boolean) to authenticated;
grant execute on function public.set_all_shop_feature_locks(uuid, boolean) to authenticated;
grant execute on function public.verify_shop_feature_lock_pin(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
