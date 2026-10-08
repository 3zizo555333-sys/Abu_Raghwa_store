-- Recoverable, server-side idempotency for cashier submissions.
-- This migration is intentionally not applied to the live project by this task.
begin;

create table public.invoice_intents (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key uuid not null,
  state text not null default 'pending' check (state in ('pending', 'completed', 'acknowledged', 'cancelled')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  invoice_id uuid,
  invoice_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, actor_id, idempotency_key),
  foreign key (invoice_id, shop_id) references public.invoices(id, shop_id) on delete restrict,
  check ((state in ('completed', 'acknowledged')) = (invoice_id is not null and invoice_result is not null)),
  check (state <> 'cancelled' or invoice_id is null)
);

create index invoice_intents_actor_recent_idx
  on public.invoice_intents(shop_id, actor_id, updated_at desc);
create unique index invoice_intents_one_open_per_actor_idx
  on public.invoice_intents(shop_id, actor_id)
  where state in ('pending', 'completed');

alter table public.invoice_intents enable row level security;
alter table public.invoice_intents force row level security;
revoke all on public.invoice_intents from public, anon, authenticated;

create or replace function public.create_invoice_intent(
  p_shop_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
  v_item jsonb;
  v_quantity numeric;
  v_discount numeric;
  v_sale_type text;
  v_payment_method text;
  v_discount_type text;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  if p_idempotency_key is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_INTENT';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as payload_keys(key)
    where key not in ('items', 'sale_type', 'payment_method', 'customer_name', 'customer_phone', 'discount_type', 'discount_value')
  ) then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_INVOICE_INTENT_FIELDS';
  end if;

  v_sale_type := coalesce(p_payload->>'sale_type', 'retail');
  v_payment_method := coalesce(p_payload->>'payment_method', 'cash');
  v_discount_type := coalesce(p_payload->>'discount_type', 'fixed');
  if v_sale_type not in ('retail', 'wholesale', 'bulk')
     or v_payment_method not in ('cash', 'card', 'check', 'bank_transfer', 'other')
     or v_discount_type not in ('percent', 'fixed') then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_INTENT_FIELDS';
  end if;
  if length(coalesce(p_payload->>'customer_name', '')) > 255
     or length(coalesce(p_payload->>'customer_phone', '')) > 32 then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_CUSTOMER';
  end if;

  begin
    v_discount := coalesce(nullif(p_payload->>'discount_value', '')::numeric, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_DISCOUNT';
  end;
  if v_discount < 0 or v_discount > 999999999999.9999
     or (v_discount_type = 'percent' and v_discount > 100) then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_DISCOUNT';
  end if;

  if coalesce(jsonb_typeof(p_payload->'items'), '') <> 'array' then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_ITEMS';
  end if;
  if jsonb_array_length(p_payload->'items') < 1 or jsonb_array_length(p_payload->'items') > 200 then
    raise exception using errcode = '22023', message = 'INVALID_INVOICE_ITEMS';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'items') as items(value) loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item->>'product_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or length(coalesce(v_item->>'selected_unit_type', '')) not between 1 and 64
       or coalesce(v_item->>'quantity', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception using errcode = '22023', message = 'INVALID_INVOICE_ITEM';
    end if;
    v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity <= 0 or v_quantity > 999999999999.999999 then
      raise exception using errcode = '22023', message = 'INVALID_INVOICE_QUANTITY';
    end if;
  end loop;

  -- Serialize intent creation per actor/shop so concurrent tabs cannot create
  -- two independent open sales. The partial unique index is a second guard.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_shop_id::text || ':' || v_actor_id::text, 0)
  );
  select * into v_intent
  from public.invoice_intents
  where shop_id = p_shop_id and actor_id = v_actor_id
    and state in ('pending', 'completed')
  order by updated_at desc
  limit 1
  for update;
  if found then
    if v_intent.idempotency_key = p_idempotency_key and v_intent.payload = p_payload then
      return jsonb_build_object('intent_id', v_intent.id, 'state', v_intent.state,
        'payload', v_intent.payload, 'invoice_result', v_intent.invoice_result,
        'created_at', v_intent.created_at);
    end if;
    raise exception using errcode = '55000', message = 'UNRESOLVED_INVOICE_INTENT';
  end if;

  insert into public.invoice_intents(shop_id, actor_id, idempotency_key, payload)
  values (p_shop_id, v_actor_id, p_idempotency_key, p_payload)
  on conflict (shop_id, actor_id, idempotency_key) do nothing
  returning * into v_intent;
  if not found then
    select * into v_intent from public.invoice_intents
    where shop_id = p_shop_id and actor_id = v_actor_id and idempotency_key = p_idempotency_key
    for update;
    if v_intent.payload <> p_payload then
      raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH';
    end if;
    if v_intent.state = 'cancelled' then
      raise exception using errcode = '55000', message = 'INVOICE_INTENT_CANCELLED';
    end if;
  end if;

  return jsonb_build_object('intent_id', v_intent.id, 'state', v_intent.state,
    'payload', v_intent.payload, 'invoice_result', v_intent.invoice_result,
    'created_at', v_intent.created_at);
end;
$$;

create or replace function public.get_recoverable_invoice_intent(p_shop_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  select * into v_intent from public.invoice_intents
  where shop_id = p_shop_id and actor_id = v_actor_id and state in ('pending', 'completed')
  order by updated_at desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('intent_id', v_intent.id, 'state', v_intent.state,
    'payload', v_intent.payload, 'invoice_result', v_intent.invoice_result,
    'created_at', v_intent.created_at);
end;
$$;

create or replace function public.complete_invoice_intent(p_shop_id uuid, p_intent_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
  v_result jsonb;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  select * into v_intent from public.invoice_intents
  where id = p_intent_id and shop_id = p_shop_id and actor_id = v_actor_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_INTENT_NOT_FOUND'; end if;
  if v_intent.state in ('completed', 'acknowledged') then
    return coalesce(v_intent.invoice_result, '{}'::jsonb) ||
      jsonb_build_object('intent_id', v_intent.id, 'intent_state', v_intent.state, 'idempotent_replay', true);
  end if;
  if v_intent.state <> 'pending' then
    raise exception using errcode = '55000', message = 'INVOICE_INTENT_NOT_PENDING';
  end if;

  v_result := public.create_invoice_with_stock(
    p_shop_id,
    v_intent.idempotency_key,
    v_intent.payload->'items',
    coalesce(v_intent.payload->>'sale_type', 'retail'),
    coalesce(v_intent.payload->>'payment_method', 'cash'),
    coalesce(v_intent.payload->>'customer_name', ''),
    coalesce(v_intent.payload->>'customer_phone', ''),
    coalesce(v_intent.payload->>'discount_type', 'fixed'),
    coalesce(nullif(v_intent.payload->>'discount_value', '')::numeric, 0)
  );
  update public.invoice_intents
  set state = 'completed',
      invoice_id = (v_result->>'invoice_id')::uuid,
      invoice_result = v_result,
      updated_at = now()
  where id = v_intent.id;
  return v_result || jsonb_build_object('intent_id', v_intent.id, 'intent_state', 'completed');
end;
$$;

create or replace function public.acknowledge_invoice_intent(p_shop_id uuid, p_intent_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  select * into v_intent from public.invoice_intents
  where id = p_intent_id and shop_id = p_shop_id and actor_id = v_actor_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_INTENT_NOT_FOUND'; end if;
  if v_intent.state = 'completed' then
    update public.invoice_intents set state = 'acknowledged', updated_at = now() where id = v_intent.id;
    v_intent.state := 'acknowledged';
  elsif v_intent.state <> 'acknowledged' then
    raise exception using errcode = '55000', message = 'INVOICE_INTENT_NOT_COMPLETED';
  end if;
  return coalesce(v_intent.invoice_result, '{}'::jsonb) ||
    jsonb_build_object('intent_id', v_intent.id, 'intent_state', v_intent.state);
end;
$$;

create or replace function public.cancel_pending_invoice_intent(p_shop_id uuid, p_intent_id uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  select * into v_intent from public.invoice_intents
  where id = p_intent_id and shop_id = p_shop_id and actor_id = v_actor_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_INTENT_NOT_FOUND'; end if;
  if v_intent.state = 'pending' then
    update public.invoice_intents set state = 'cancelled', updated_at = now() where id = v_intent.id;
    return jsonb_build_object('intent_id', v_intent.id, 'state', 'cancelled');
  end if;
  if v_intent.state = 'cancelled' then
    return jsonb_build_object('intent_id', v_intent.id, 'state', 'cancelled');
  end if;
  raise exception using errcode = '55000', message = 'COMPLETED_INVOICE_INTENT_CANNOT_BE_CANCELLED';
end;
$$;

revoke all on function public.create_invoice_intent(uuid, uuid, jsonb) from public, anon;
revoke all on function public.get_recoverable_invoice_intent(uuid) from public, anon;
revoke all on function public.complete_invoice_intent(uuid, uuid) from public, anon;
revoke all on function public.acknowledge_invoice_intent(uuid, uuid) from public, anon;
revoke all on function public.cancel_pending_invoice_intent(uuid, uuid) from public, anon;
revoke all on function public.create_invoice_with_stock(uuid, uuid, jsonb, text, text, text, text, text, numeric) from authenticated;
grant execute on function public.create_invoice_intent(uuid, uuid, jsonb) to authenticated;
grant execute on function public.get_recoverable_invoice_intent(uuid) to authenticated;
grant execute on function public.complete_invoice_intent(uuid, uuid) to authenticated;
grant execute on function public.acknowledge_invoice_intent(uuid, uuid) to authenticated;
grant execute on function public.cancel_pending_invoice_intent(uuid, uuid) to authenticated;

commit;
