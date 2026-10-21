begin;

-- Keep every earning channel in the existing Supabase wallet and ledger.
alter table public.loyalty_point_ledger
  add column if not exists source text not null default 'cashier',
  add column if not exists source_id text,
  add column if not exists idempotency_key text,
  add column if not exists requested_points_delta numeric(18,2);

update public.loyalty_point_ledger
   set source = case when entry_type = 'manual_adjustment' then 'manual' else 'cashier' end,
       source_id = coalesce(source_id, invoice_id::text, return_id::text),
       requested_points_delta = coalesce(requested_points_delta, points_delta),
       idempotency_key = coalesce(
         idempotency_key,
         case
           when entry_type = 'invoice_earned' and invoice_item_id is not null then 'cashier:invoice-item:' || invoice_item_id::text
           when entry_type = 'return_reversed' and return_id is not null and invoice_item_id is not null then 'cashier:return:' || return_id::text || ':item:' || invoice_item_id::text
           else null
         end
       );

alter table public.loyalty_point_ledger
  add constraint loyalty_point_ledger_source_check
  check (source in ('cashier', 'catalog', 'offer', 'reward', 'referral', 'manual'));

create unique index if not exists loyalty_point_ledger_idempotency_uidx
  on public.loyalty_point_ledger(shop_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists loyalty_point_ledger_customer_recent_idx
  on public.loyalty_point_ledger(shop_id, customer_id, created_at desc, id desc);

create or replace function public.set_loyalty_ledger_source_defaults()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.requested_points_delta := coalesce(new.requested_points_delta, new.points_delta);
  if new.source_id is null then
    new.source_id := coalesce(new.invoice_id::text, new.return_id::text);
  end if;
  if new.idempotency_key is null then
    if new.entry_type = 'invoice_earned' and new.invoice_item_id is not null then
      new.source := 'cashier';
      new.idempotency_key := 'cashier:invoice-item:' || new.invoice_item_id::text;
    elsif new.entry_type = 'return_reversed' and new.return_id is not null and new.invoice_item_id is not null then
      new.source := 'cashier';
      new.idempotency_key := 'cashier:return:' || new.return_id::text || ':item:' || new.invoice_item_id::text;
    elsif new.entry_type = 'manual_adjustment' and new.source is null then
      new.source := 'manual';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists loyalty_ledger_source_defaults on public.loyalty_point_ledger;
create trigger loyalty_ledger_source_defaults
before insert on public.loyalty_point_ledger
for each row execute function public.set_loyalty_ledger_source_defaults();

-- Keep existing cashier codes compatible while using the AR family for new cards.
create or replace function public.set_new_loyalty_customer_code()
returns trigger language plpgsql set search_path = '' as $$
begin
  if upper(coalesce(new.customer_code, '')) like 'POS-%' then
    new.customer_code := 'AR-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
  end if;
  return new;
end;
$$;
drop trigger if exists loyalty_customer_code_format on public.loyalty_customers;
create trigger loyalty_customer_code_format before insert on public.loyalty_customers
for each row execute function public.set_new_loyalty_customer_code();
revoke all on function public.set_new_loyalty_customer_code() from public, anon, authenticated;

-- Server-only context resolver. It refuses to guess in a multi-tenant database.
create or replace function public.get_unique_loyalty_shop_id()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare v_shop_id uuid; v_shop_count bigint;
begin
  select count(*), (array_agg(id))[1] into v_shop_count, v_shop_id from public.shops;
  if v_shop_count <> 1 then return null; end if;
  return v_shop_id;
end;
$$;

create or replace function public.ensure_loyalty_customer(
  p_shop_id uuid,
  p_phone text,
  p_full_name text default '',
  p_customer_code text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_name text := left(coalesce(nullif(trim(p_full_name), ''), 'عميل أبو رغوة'), 180);
  v_customer public.loyalty_customers%rowtype;
  v_match_count integer;
  v_code text;
  v_attempt integer := 0;
  v_created boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'LOYALTY_SERVER_ONLY';
  end if;
  if p_shop_id is null or not exists (select 1 from public.shops s where s.id = p_shop_id) then
    raise exception using errcode = '22023', message = 'LOYALTY_SHOP_REQUIRED';
  end if;
  if length(v_phone) < 7 or length(v_phone) > 20 then
    raise exception using errcode = '22023', message = 'LOYALTY_PHONE_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || v_phone, 0));
  select count(*) into v_match_count from public.loyalty_customers c
   where c.shop_id = p_shop_id and c.deleted_at is null
     and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone;
  if v_match_count > 1 then
    raise exception using errcode = '23505', message = 'LOYALTY_PHONE_DUPLICATE_REQUIRES_REVIEW';
  end if;
  select * into v_customer from public.loyalty_customers c
   where c.shop_id = p_shop_id and c.deleted_at is null
     and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone
   limit 1 for update;
  if found then
    if p_customer_code is not null and upper(trim(p_customer_code)) <> upper(v_customer.customer_code) then
      -- Phone is the canonical identifier for channel reconciliation; return the existing Supabase code.
      null;
    end if;
    update public.loyalty_customers set full_name = case when v_name = 'عميل أبو رغوة' then full_name else v_name end,
      updated_at = now() where id = v_customer.id and shop_id = p_shop_id returning * into v_customer;
    return jsonb_build_object('id', v_customer.id, 'shop_id', v_customer.shop_id, 'customer_code', v_customer.customer_code,
      'full_name', v_customer.full_name, 'phone', v_customer.phone, 'current_points', v_customer.current_points, 'created', false);
  end if;
  loop
    v_attempt := v_attempt + 1;
    v_code := 'AR-' || upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    begin
      insert into public.loyalty_customers(shop_id, customer_code, full_name, phone)
      values (p_shop_id, v_code, v_name, v_phone)
      returning * into v_customer;
      v_created := true;
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('id', v_customer.id, 'shop_id', v_customer.shop_id, 'customer_code', v_customer.customer_code,
    'full_name', v_customer.full_name, 'phone', v_customer.phone, 'current_points', v_customer.current_points, 'created', v_created);
end;
$$;

create or replace function public.apply_loyalty_wallet_event(
  p_shop_id uuid,
  p_phone text,
  p_full_name text,
  p_points_delta numeric,
  p_source text,
  p_source_id text,
  p_idempotency_key text,
  p_description text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_customer public.loyalty_customers%rowtype;
  v_inserted_id uuid;
  v_delta numeric(18,2) := round(p_points_delta, 2);
  v_key text := trim(coalesce(p_idempotency_key, ''));
  v_existing_customer_id uuid;
  v_existing_delta numeric(18,2);
  v_existing_source text;
  v_existing_source_id text;
  v_existing_requested_delta numeric(18,2);
  v_requested_delta numeric(18,2);
  v_inserted boolean := false;
  v_phone_match_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'LOYALTY_SERVER_ONLY';
  end if;
  if p_source is null or p_source not in ('catalog', 'offer', 'reward', 'referral', 'manual', 'cashier') then
    raise exception using errcode = '22023', message = 'LOYALTY_SOURCE_INVALID';
  end if;
  if p_shop_id is null or p_points_delta is null or length(v_phone) < 7 or length(v_phone) > 20 or v_delta = 0 or abs(v_delta) > 1000000
     or length(v_key) < 1 or length(v_key) > 240 then
    raise exception using errcode = '22023', message = 'LOYALTY_EVENT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_shop_id::text || ':' || v_phone, 0));
  select count(*) into v_phone_match_count from public.loyalty_customers c
   where c.shop_id = p_shop_id and c.deleted_at is null
     and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone;
  if v_phone_match_count > 1 then
    raise exception using errcode = '23505', message = 'LOYALTY_PHONE_DUPLICATE_REQUIRES_REVIEW';
  end if;
  select * into v_customer from public.loyalty_customers c
   where c.shop_id = p_shop_id and c.deleted_at is null
     and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone
   order by c.created_at asc limit 1 for update;
  if not found then
    perform public.ensure_loyalty_customer(p_shop_id, v_phone, p_full_name, null);
    select * into v_customer from public.loyalty_customers c
     where c.shop_id = p_shop_id and c.deleted_at is null
       and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone
     order by c.created_at asc limit 1 for update;
  end if;
  if not found then raise exception using errcode = 'P0002', message = 'LOYALTY_CUSTOMER_NOT_FOUND'; end if;
  v_requested_delta := v_delta;
  select l.customer_id, l.points_delta, l.source, l.source_id, l.requested_points_delta
    into v_existing_customer_id, v_existing_delta, v_existing_source, v_existing_source_id, v_existing_requested_delta
    from public.loyalty_point_ledger l where l.shop_id = p_shop_id and l.idempotency_key = v_key;
  if found then
    if v_existing_customer_id is distinct from v_customer.id or v_existing_source is distinct from p_source
       or coalesce(v_existing_source_id, '') is distinct from left(coalesce(p_source_id, ''), 180)
       or v_existing_requested_delta is distinct from v_requested_delta then
      raise exception using errcode = '23505', message = 'LOYALTY_IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return jsonb_build_object('customer_id', v_customer.id, 'customer_code', v_customer.customer_code,
      'points_delta', v_existing_delta, 'current_points', v_customer.current_points, 'inserted', false);
  end if;
  if v_delta < 0 then v_delta := -least(abs(v_delta), v_customer.current_points); end if;
  if v_delta = 0 then
    return jsonb_build_object('customer_id', v_customer.id, 'customer_code', v_customer.customer_code,
      'points_delta', 0, 'current_points', v_customer.current_points, 'inserted', false);
  end if;
  insert into public.loyalty_point_ledger(shop_id, customer_id, points_delta, requested_points_delta, entry_type, description, source, source_id, idempotency_key)
  values (p_shop_id, v_customer.id, v_delta, v_requested_delta, 'manual_adjustment', left(coalesce(p_description, ''), 500), p_source, left(coalesce(p_source_id, ''), 180), v_key)
  on conflict (shop_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_inserted_id;
  if v_inserted_id is null then
    select l.customer_id, l.points_delta, l.source, l.source_id, l.requested_points_delta
      into v_existing_customer_id, v_existing_delta, v_existing_source, v_existing_source_id, v_existing_requested_delta from public.loyalty_point_ledger l
     where l.shop_id = p_shop_id and l.idempotency_key = v_key;
    if v_existing_customer_id is distinct from v_customer.id or v_existing_source is distinct from p_source
       or coalesce(v_existing_source_id, '') is distinct from left(coalesce(p_source_id, ''), 180)
       or v_existing_requested_delta is distinct from v_requested_delta then
      raise exception using errcode = '23505', message = 'LOYALTY_IDEMPOTENCY_KEY_CONFLICT';
    end if;
    return jsonb_build_object('customer_id', v_customer.id, 'customer_code', v_customer.customer_code,
      'points_delta', v_existing_delta, 'current_points', v_customer.current_points, 'inserted', false);
  end if;
  update public.loyalty_customers
     set current_points = greatest(0, current_points + v_delta),
         total_points_earned = case when v_delta > 0 then total_points_earned + v_delta else total_points_earned end,
         updated_at = now()
   where id = v_customer.id and shop_id = p_shop_id returning * into v_customer;
  v_inserted := true;
  return jsonb_build_object('customer_id', v_customer.id, 'customer_code', v_customer.customer_code,
    'points_delta', v_delta, 'current_points', v_customer.current_points, 'inserted', v_inserted);
end;
$$;

create or replace function public.get_loyalty_wallet_by_identifier(p_phone text default null, p_customer_code text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_code text := upper(trim(coalesce(p_customer_code, '')));
  v_customer public.loyalty_customers%rowtype;
  v_count integer;
  v_transactions jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'LOYALTY_SERVER_ONLY';
  end if;
  if v_code <> '' then
    select count(*) into v_count from public.loyalty_customers c where c.deleted_at is null and upper(c.customer_code) = v_code;
    if v_count <> 1 then return null; end if;
    select * into v_customer from public.loyalty_customers c where c.deleted_at is null and upper(c.customer_code) = v_code limit 1;
    if v_phone <> '' and regexp_replace(v_customer.phone, '[^0-9]+', '', 'g') <> v_phone then return null; end if;
  elsif length(v_phone) >= 7 then
    select count(*) into v_count from public.loyalty_customers c where c.deleted_at is null and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone;
    if v_count <> 1 then return null; end if;
    select * into v_customer from public.loyalty_customers c where c.deleted_at is null and regexp_replace(c.phone, '[^0-9]+', '', 'g') = v_phone limit 1;
  else
    return null;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', recent.id, 'points', recent.points_delta,
    'type', case when recent.points_delta < 0 then 'deduction' else 'earned' end,
    'source', recent.source, 'description', recent.description,
    'orderId', recent.source_id, 'createdAt', recent.created_at
  ) order by recent.created_at desc, recent.id desc), '[]'::jsonb)
    into v_transactions from (
      select l.id, l.points_delta, l.source, l.description, l.source_id, l.created_at
        from public.loyalty_point_ledger l
       where l.shop_id = v_customer.shop_id and l.customer_id = v_customer.id
       order by l.created_at desc, l.id desc limit 200
    ) recent;
  return jsonb_build_object('name', v_customer.full_name, 'customerCode', v_customer.customer_code,
    'phone', v_customer.phone, 'points', v_customer.current_points, 'usedCoupons', '[]'::jsonb,
    'transactions', v_transactions);
end;
$$;

create or replace function public.list_loyalty_wallets(p_shop_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'LOYALTY_SERVER_ONLY';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'shop_id', c.shop_id, 'customer_code', c.customer_code,
    'full_name', c.full_name, 'phone', c.phone, 'current_points', c.current_points,
    'total_points_earned', c.total_points_earned, 'updated_at', c.updated_at) order by c.updated_at desc)
    from public.loyalty_customers c where c.shop_id = p_shop_id and c.deleted_at is null), '[]'::jsonb);
end;
$$;

revoke all on function public.get_unique_loyalty_shop_id() from public, anon, authenticated;
revoke all on function public.ensure_loyalty_customer(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.apply_loyalty_wallet_event(uuid, text, text, numeric, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_loyalty_wallet_by_identifier(text, text) from public, anon, authenticated;
revoke all on function public.list_loyalty_wallets(uuid) from public, anon, authenticated;
grant execute on function public.get_unique_loyalty_shop_id() to service_role;
grant execute on function public.ensure_loyalty_customer(uuid, text, text, text) to service_role;
grant execute on function public.apply_loyalty_wallet_event(uuid, text, text, numeric, text, text, text, text) to service_role;
grant execute on function public.get_loyalty_wallet_by_identifier(text, text) to service_role;
grant execute on function public.list_loyalty_wallets(uuid) to service_role;

notify pgrst, 'reload schema';
commit;
