begin;

alter table public.catalog_orders
  add column if not exists coupon_code text;

create table if not exists public.catalog_coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  coupon_code text not null,
  customer_phone text not null,
  order_id uuid not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint catalog_coupon_redemptions_normalized_code check (coupon_code = pg_catalog.upper(pg_catalog.btrim(coupon_code))),
  constraint catalog_coupon_redemptions_nonempty_phone check (customer_phone <> ''),
  constraint catalog_coupon_redemptions_once_per_customer unique (shop_id, coupon_code, customer_phone)
);

alter table public.catalog_coupon_redemptions enable row level security;
revoke all on public.catalog_coupon_redemptions from public, anon, authenticated;
grant all on public.catalog_coupon_redemptions to service_role;

create or replace function public.validate_catalog_coupon_for_customer(
  p_shop_id uuid,
  p_code text,
  p_order_amount numeric,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_phone text := pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_customer_phone, '')), '\s+', '', 'g'),
    '^\+2',
    ''
  );
begin
  if v_phone <> '' and exists (
    select 1
      from public.catalog_coupon_redemptions r
     where r.shop_id = p_shop_id
       and r.coupon_code = pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')))
       and r.customer_phone = v_phone
  ) then
    return pg_catalog.jsonb_build_object('valid', false, 'error_code', 'coupon_already_used');
  end if;

  return public.validate_catalog_coupon(p_shop_id, p_code, p_order_amount);
end;
$function$;

revoke all on function public.validate_catalog_coupon_for_customer(uuid, text, numeric, text) from public;
grant execute on function public.validate_catalog_coupon_for_customer(uuid, text, numeric, text) to anon, authenticated, service_role;

create or replace function public.record_catalog_coupon_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_code text;
  v_phone text;
  v_subtotal numeric(18,4) := 0;
  v_item jsonb;
  v_validation jsonb;
  v_expected_total numeric(18,4);
begin
  if nullif(pg_catalog.btrim(coalesce(new.coupon_code, '')), '') is null then
    new.coupon_code := null;
    return new;
  end if;

  v_code := pg_catalog.upper(pg_catalog.btrim(new.coupon_code));
  v_phone := pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(new.customer_phone, '')), '\s+', '', 'g'),
    '^\+2',
    ''
  );
  if pg_catalog.length(v_phone) < 7 or pg_catalog.length(v_phone) > 40 then
    raise exception using errcode = '22023', message = 'INVALID_COUPON_CUSTOMER_PHONE';
  end if;

  if exists (
    select 1 from public.catalog_coupon_redemptions r
     where r.order_id = new.id and r.shop_id = new.shop_id
       and r.coupon_code = v_code and r.customer_phone = v_phone
  ) then
    new.coupon_code := v_code;
    return new;
  end if;

  if pg_catalog.jsonb_typeof(new.items) <> 'array' or pg_catalog.jsonb_array_length(new.items) = 0 then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_ORDER_ITEMS';
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(new.items) as rows(value) loop
    v_subtotal := v_subtotal + (v_item->>'price')::numeric * (v_item->>'quantity')::numeric;
  end loop;

  v_validation := public.validate_catalog_coupon_for_customer(new.shop_id, v_code, v_subtotal, new.customer_phone);
  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    if v_validation->>'error_code' = 'coupon_already_used' then
      raise exception using errcode = '23505', message = 'COUPON_ALREADY_USED';
    elsif v_validation->>'error_code' = 'min_order_not_met' then
      raise exception using errcode = '22023', message = 'COUPON_MIN_ORDER_NOT_MET: ' || coalesce(v_validation->>'min_order_amount', '0');
    else
      raise exception using errcode = '22023', message = 'INVALID_CATALOG_COUPON: ' || coalesce(v_validation->>'error_code', 'unknown');
    end if;
  end if;

  v_expected_total := (v_validation->>'final_amount')::numeric;
  if pg_catalog.abs(new.total_amount - v_expected_total) > 0.01 then
    raise exception using errcode = '22023', message = 'INVALID_CATALOG_COUPON_TOTAL';
  end if;

  insert into public.catalog_coupon_redemptions (shop_id, coupon_code, customer_phone, order_id)
  values (new.shop_id, v_code, v_phone, new.id);
  new.coupon_code := v_code;
  return new;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'COUPON_ALREADY_USED';
end;
$function$;

revoke all on function public.record_catalog_coupon_redemption() from public, anon, authenticated;

drop trigger if exists catalog_orders_record_coupon_redemption on public.catalog_orders;
create trigger catalog_orders_record_coupon_redemption
  before insert on public.catalog_orders
  for each row execute function public.record_catalog_coupon_redemption();

create or replace function public.create_catalog_coupon_order(
  p_id uuid,
  p_shop_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_address text,
  p_note text,
  p_items jsonb,
  p_total_amount numeric,
  p_coupon_code text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_code text := pg_catalog.upper(pg_catalog.btrim(coalesce(p_coupon_code, '')));
  v_phone text := pg_catalog.regexp_replace(
    pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(p_customer_phone, '')), '\s+', '', 'g'),
    '^\+2',
    ''
  );
  v_item jsonb;
  v_item_count integer;
  v_price numeric;
  v_quantity numeric;
  v_subtotal numeric(18,4) := 0;
  v_validation jsonb;
  v_final_total numeric(18,4);
  v_existing_code text;
  v_existing_phone text;
  v_inserted_id uuid;
begin
  if p_id is null or p_shop_id is null or pg_catalog.length(pg_catalog.btrim(coalesce(p_customer_name, ''))) not between 2 and 180
     or pg_catalog.length(v_phone) not between 7 and 40 then
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'invalid_order_details');
  end if;

  select o.coupon_code, o.customer_phone
    into v_existing_code, v_existing_phone
    from public.catalog_orders o
   where o.id = p_id;
  if found then
    if coalesce(v_existing_code, '') = v_code
       and pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(v_existing_phone, '')), '\s+', '', 'g'), '^\+2', '') = v_phone then
      return pg_catalog.jsonb_build_object('success', true, 'id', p_id);
    end if;
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'order_id_conflict');
  end if;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' then
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'invalid_order_items');
  end if;
  v_item_count := pg_catalog.jsonb_array_length(p_items);
  if v_item_count < 1 or v_item_count > 100 then
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'invalid_order_items');
  end if;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_items) as rows(value) loop
    begin
      v_price := (v_item->>'price')::numeric;
      v_quantity := (v_item->>'quantity')::numeric;
    exception when others then
      return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'invalid_order_items');
    end;
    if pg_catalog.jsonb_typeof(v_item) <> 'object'
       or pg_catalog.length(pg_catalog.btrim(coalesce(v_item->>'name', ''))) = 0
       or v_price < 0 or v_quantity <= 0 then
      return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'invalid_order_items');
    end if;
    v_subtotal := v_subtotal + v_price * v_quantity;
  end loop;

  if v_code = '' then
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'coupon_not_found');
  end if;
  v_validation := public.validate_catalog_coupon_for_customer(p_shop_id, v_code, v_subtotal, p_customer_phone);
  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    return v_validation || pg_catalog.jsonb_build_object('success', false);
  end if;
  v_final_total := (v_validation->>'final_amount')::numeric;
  if p_total_amount is null or p_total_amount < 0 or pg_catalog.abs(p_total_amount - v_final_total) > 0.01 then
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'total_mismatch');
  end if;

  begin
    insert into public.catalog_orders (
      id, shop_id, customer_name, customer_phone, address, note, items, total_amount, coupon_code, status
    ) values (
      p_id, p_shop_id, pg_catalog.btrim(p_customer_name), pg_catalog.btrim(p_customer_phone),
      nullif(pg_catalog.btrim(coalesce(p_address, '')), ''), nullif(pg_catalog.btrim(coalesce(p_note, '')), ''),
      p_items, v_final_total, v_code, 'pending'
    ) returning id into v_inserted_id;
  exception when unique_violation then
    select o.coupon_code, o.customer_phone
      into v_existing_code, v_existing_phone
      from public.catalog_orders o
     where o.id = p_id;
    if found and coalesce(v_existing_code, '') = v_code
       and pg_catalog.regexp_replace(pg_catalog.regexp_replace(pg_catalog.btrim(coalesce(v_existing_phone, '')), '\s+', '', 'g'), '^\+2', '') = v_phone then
      return pg_catalog.jsonb_build_object('success', true, 'id', p_id);
    end if;
    return pg_catalog.jsonb_build_object('success', false, 'valid', false, 'error_code', 'coupon_already_used');
  end;

  return pg_catalog.jsonb_build_object('success', true, 'id', v_inserted_id);
end;
$function$;

revoke all on function public.create_catalog_coupon_order(uuid, uuid, text, text, text, text, jsonb, numeric, text) from public, anon, authenticated;
grant execute on function public.create_catalog_coupon_order(uuid, uuid, text, text, text, text, jsonb, numeric, text) to service_role;

notify pgrst, 'reload schema';
commit;
