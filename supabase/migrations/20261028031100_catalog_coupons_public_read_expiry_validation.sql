begin;

alter table public.catalog_coupons enable row level security;

drop policy if exists catalog_coupons_public_active_read on public.catalog_coupons;
create policy catalog_coupons_public_active_read
  on public.catalog_coupons
  for select
  to anon, authenticated
  using (
    is_active = true
    and (valid_from is null or valid_from <= pg_catalog.now())
    and (valid_until is null or valid_until > pg_catalog.now())
  );

grant select on table public.catalog_coupons to anon, authenticated;

grant execute on function public.list_active_catalog_coupons(uuid) to anon, authenticated;

create or replace function public.validate_catalog_coupon(
  p_shop_id uuid,
  p_code text,
  p_order_amount numeric
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_coupon public.catalog_coupons%rowtype;
  v_discount numeric(12,2);
  v_now timestamptz := pg_catalog.now();
begin
  if p_order_amount is null or p_order_amount < 0 then
    return jsonb_build_object('valid', false, 'error_code', 'invalid_order_amount');
  end if;

  select *
    into v_coupon
    from public.catalog_coupons c
   where c.shop_id = p_shop_id
     and pg_catalog.upper(c.code) = pg_catalog.upper(pg_catalog.btrim(coalesce(p_code, '')))
     and c.is_active = true
   limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'error_code', 'coupon_not_found');
  end if;

  if v_coupon.valid_from is not null and v_coupon.valid_from > v_now then
    return jsonb_build_object('valid', false, 'error_code', 'coupon_not_started');
  end if;

  if v_coupon.valid_until is not null and v_coupon.valid_until <= v_now then
    return jsonb_build_object('valid', false, 'error_code', 'coupon_expired');
  end if;

  if p_order_amount < v_coupon.min_order_amount then
    return jsonb_build_object(
      'valid', false,
      'error_code', 'min_order_not_met',
      'min_order_amount', v_coupon.min_order_amount
    );
  end if;

  if v_coupon.discount_type = 'percentage' then
    v_discount := round(p_order_amount * (v_coupon.discount_value / 100.0), 2);
    if v_coupon.max_discount_amount is not null and v_discount > v_coupon.max_discount_amount then
      v_discount := v_coupon.max_discount_amount;
    end if;
  else
    v_discount := least(v_coupon.discount_value, p_order_amount);
  end if;

  return jsonb_build_object(
    'valid', true,
    'discount_amount', v_discount,
    'final_amount', greatest(0, p_order_amount - v_discount)
  );
end;
$function$;

grant execute on function public.validate_catalog_coupon(uuid, text, numeric) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
