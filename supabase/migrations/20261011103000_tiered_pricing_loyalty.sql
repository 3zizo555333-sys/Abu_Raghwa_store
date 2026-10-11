-- Tiered prices already exist as retail_price, wholesale_retail_price and bulk_price.
-- Add independent loyalty points without removing or rewriting existing commercial data.
alter table public.products
  add column if not exists retail_loyalty_points numeric(18,2) not null default 0 check (retail_loyalty_points >= 0),
  add column if not exists sub_wholesale_loyalty_points numeric(18,2) not null default 0 check (sub_wholesale_loyalty_points >= 0),
  add column if not exists wholesale_loyalty_points numeric(18,2) not null default 0 check (wholesale_loyalty_points >= 0);

-- Preserve the existing single points value as the starting value for every tier.
update public.products
   set retail_loyalty_points = coalesce(retail_loyalty_points, loyalty_points),
       sub_wholesale_loyalty_points = coalesce(sub_wholesale_loyalty_points, loyalty_points),
       wholesale_loyalty_points = coalesce(wholesale_loyalty_points, loyalty_points)
 where retail_loyalty_points = 0
    or sub_wholesale_loyalty_points = 0
    or wholesale_loyalty_points = 0;

create or replace function public.create_product(p_shop_id uuid, p_payload jsonb)
returns public.products language plpgsql security definer set search_path = '' as $$
declare v_product public.products;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'PRODUCT_WRITE_FORBIDDEN'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or nullif(trim(p_payload->>'name'), '') is null then raise exception using errcode = '22023', message = 'INVALID_PRODUCT'; end if;
  if jsonb_typeof(coalesce(p_payload->'barcodes','[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_payload->'barcodes','[]'::jsonb)) > 100 then raise exception using errcode = '22023', message = 'INVALID_BARCODES'; end if;
  insert into public.products(
    shop_id, name, code, barcode, barcodes, plu, sale_mode, unit_name, content_unit, units_per_package,
    wholesale_price_per_unit, wholesale_price_per_piece, retail_price, wholesale_retail_price, bulk_price,
    cost_per_unit, cost_per_piece, bulk_profit_percent, retail_profit_percent, category_id, category_name,
    quantity, min_quantity, loyalty_points, retail_loyalty_points, sub_wholesale_loyalty_points, wholesale_loyalty_points, created_by, updated_by
  ) values (
    p_shop_id, trim(p_payload->>'name'), nullif(trim(p_payload->>'code'), ''), nullif(trim(p_payload->>'barcode'), ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'barcodes','[]'::jsonb))), '{}'), nullif(trim(p_payload->>'plu'), ''),
    coalesce(nullif(p_payload->>'sale_mode','')::public.product_sale_mode, 'unit'), coalesce(nullif(trim(p_payload->>'unit_name'), ''), 'عبوة'),
    coalesce(nullif(trim(p_payload->>'content_unit'), ''), 'قطعة'), coalesce(nullif(p_payload->>'units_per_package','')::numeric, 1),
    coalesce(nullif(p_payload->>'wholesale_price_per_unit','')::numeric, 0), coalesce(nullif(p_payload->>'wholesale_price_per_piece','')::numeric, 0),
    coalesce(nullif(p_payload->>'retail_price','')::numeric, 0), coalesce(nullif(p_payload->>'wholesale_retail_price','')::numeric, 0),
    coalesce(nullif(p_payload->>'bulk_price','')::numeric, 0), coalesce(nullif(p_payload->>'cost_per_unit','')::numeric, 0),
    coalesce(nullif(p_payload->>'cost_per_piece','')::numeric, 0), coalesce(nullif(p_payload->>'bulk_profit_percent','')::numeric, 0),
    coalesce(nullif(p_payload->>'retail_profit_percent','')::numeric, 0), nullif(p_payload->>'category_id','')::uuid,
    coalesce(nullif(trim(p_payload->>'category_name'), ''), 'بدون فئة'), coalesce(nullif(p_payload->>'quantity','')::numeric, 0),
    coalesce(nullif(p_payload->>'min_quantity','')::numeric, 0),
    coalesce(nullif(p_payload->>'loyalty_points','')::integer, 0),
    coalesce(nullif(p_payload->>'retail_loyalty_points','')::numeric, nullif(p_payload->>'loyalty_points','')::numeric, 0),
    coalesce(nullif(p_payload->>'sub_wholesale_loyalty_points','')::numeric, nullif(p_payload->>'loyalty_points','')::numeric, 0),
    coalesce(nullif(p_payload->>'wholesale_loyalty_points','')::numeric, nullif(p_payload->>'loyalty_points','')::numeric, 0),
    (select auth.uid()), (select auth.uid())
  ) returning * into v_product;
  insert into public.product_barcodes(shop_id, product_id, barcode, is_primary)
  select p_shop_id, v_product.id, code, code = v_product.barcode
  from (select distinct trim(raw_code) as code from unnest(v_product.barcodes || array[v_product.barcode]) raw(raw_code)
        where nullif(trim(raw_code), '') is not null) codes;
  return v_product;
end;
$$;

create or replace function public.update_product(p_shop_id uuid, p_product_id uuid, p_expected_version bigint, p_payload jsonb)
returns public.products language plpgsql security definer set search_path = '' as $$
declare v_current public.products; v_product public.products;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'PRODUCT_WRITE_FORBIDDEN'; end if;
  if p_payload ? 'barcodes' and (jsonb_typeof(p_payload->'barcodes') <> 'array' or jsonb_array_length(p_payload->'barcodes') > 100) then raise exception using errcode = '22023', message = 'INVALID_BARCODES'; end if;
  select * into v_current from public.products where id = p_product_id and shop_id = p_shop_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if v_current.version <> p_expected_version then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  update public.products set
    name = coalesce(nullif(trim(p_payload->>'name'), ''), name), code = case when p_payload ? 'code' then nullif(trim(p_payload->>'code'), '') else code end,
    barcode = case when p_payload ? 'barcode' then nullif(trim(p_payload->>'barcode'), '') else barcode end,
    barcodes = case when p_payload ? 'barcodes' then coalesce(array(select jsonb_array_elements_text(p_payload->'barcodes')), '{}') else barcodes end,
    plu = case when p_payload ? 'plu' then nullif(trim(p_payload->>'plu'), '') else plu end,
    sale_mode = coalesce(nullif(p_payload->>'sale_mode','')::public.product_sale_mode, sale_mode), unit_name = coalesce(nullif(trim(p_payload->>'unit_name'), ''), unit_name),
    content_unit = coalesce(nullif(trim(p_payload->>'content_unit'), ''), content_unit), units_per_package = coalesce(nullif(p_payload->>'units_per_package','')::numeric, units_per_package),
    wholesale_price_per_unit = coalesce(nullif(p_payload->>'wholesale_price_per_unit','')::numeric, wholesale_price_per_unit), wholesale_price_per_piece = coalesce(nullif(p_payload->>'wholesale_price_per_piece','')::numeric, wholesale_price_per_piece),
    retail_price = coalesce(nullif(p_payload->>'retail_price','')::numeric, retail_price), wholesale_retail_price = coalesce(nullif(p_payload->>'wholesale_retail_price','')::numeric, wholesale_retail_price), bulk_price = coalesce(nullif(p_payload->>'bulk_price','')::numeric, bulk_price),
    cost_per_unit = coalesce(nullif(p_payload->>'cost_per_unit','')::numeric, cost_per_unit), cost_per_piece = coalesce(nullif(p_payload->>'cost_per_piece','')::numeric, cost_per_piece),
    bulk_profit_percent = coalesce(nullif(p_payload->>'bulk_profit_percent','')::numeric, bulk_profit_percent), retail_profit_percent = coalesce(nullif(p_payload->>'retail_profit_percent','')::numeric, retail_profit_percent),
    category_id = case when p_payload ? 'category_id' then nullif(p_payload->>'category_id','')::uuid else category_id end, category_name = coalesce(nullif(trim(p_payload->>'category_name'), ''), category_name),
    quantity = coalesce(nullif(p_payload->>'quantity','')::numeric, quantity), min_quantity = coalesce(nullif(p_payload->>'min_quantity','')::numeric, min_quantity),
    loyalty_points = coalesce(nullif(p_payload->>'loyalty_points','')::integer, loyalty_points),
    retail_loyalty_points = coalesce(nullif(p_payload->>'retail_loyalty_points','')::numeric, retail_loyalty_points),
    sub_wholesale_loyalty_points = coalesce(nullif(p_payload->>'sub_wholesale_loyalty_points','')::numeric, sub_wholesale_loyalty_points),
    wholesale_loyalty_points = coalesce(nullif(p_payload->>'wholesale_loyalty_points','')::numeric, wholesale_loyalty_points),
    version = version + 1, updated_by = (select auth.uid()), updated_at = now()
  where id = p_product_id and shop_id = p_shop_id and version = p_expected_version returning * into v_product;
  if not found then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  if p_payload ? 'barcode' or p_payload ? 'barcodes' then
    delete from public.product_barcodes where shop_id = p_shop_id and product_id = p_product_id;
    insert into public.product_barcodes(shop_id, product_id, barcode, is_primary)
    select p_shop_id, v_product.id, code, code = v_product.barcode
    from (select distinct trim(raw_code) as code from unnest(v_product.barcodes || array[v_product.barcode]) raw(raw_code)
          where nullif(trim(raw_code), '') is not null) codes;
  end if;
  return v_product;
end;
$$;

-- The server remains authoritative for the selected sale type.
create or replace function public.apply_invoice_loyalty(p_shop_id uuid, p_invoice_id uuid, p_customer_name text, p_customer_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_invoice public.invoices%rowtype; v_customer public.loyalty_customers%rowtype; v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]+', '', 'g'); v_points numeric(18,2) := 0; v_item record; v_item_points numeric(18,2); v_code text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND'; end if;
  select * into v_customer from public.loyalty_customers where shop_id = p_shop_id and deleted_at is null and v_phone <> '' and regexp_replace(phone, '[^0-9]+', '', 'g') = v_phone order by created_at asc limit 1 for update;
  if not found and v_phone <> '' then
    v_code := 'POS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.loyalty_customers(shop_id, customer_code, full_name, phone) values (p_shop_id, v_code, left(coalesce(nullif(trim(p_customer_name), ''), 'عميل الكاشير'), 180), left(coalesce(p_customer_phone, ''), 40)) returning * into v_customer;
  end if;
  for v_item in select ii.*, case v_invoice.sale_type when 'wholesale' then coalesce(p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points) when 'bulk' then coalesce(p.wholesale_loyalty_points, p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points) else coalesce(p.retail_loyalty_points, p.loyalty_points) end::numeric as product_points from public.invoice_items ii left join public.products p on p.id = ii.product_id and p.shop_id = ii.shop_id where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id order by ii.id loop
    v_item_points := floor(v_item.product_points * v_item.quantity * 100) / 100;
    update public.invoice_items set loyalty_points_snapshot = v_item_points where id = v_item.id and shop_id = p_shop_id;
    v_points := v_points + v_item_points;
    if v_customer.id is not null and v_item_points > 0 then insert into public.loyalty_point_ledger(shop_id, customer_id, invoice_id, invoice_item_id, points_delta, entry_type, description, created_by) values (p_shop_id, v_customer.id, p_invoice_id, v_item.id, v_item_points, 'invoice_earned', 'نقاط مكتسبة من الفاتورة ' || v_invoice.invoice_number, v_invoice.created_by) on conflict do nothing; end if;
  end loop;
  insert into public.invoice_loyalty_points(shop_id, invoice_id, customer_id, points_earned) values (p_shop_id, p_invoice_id, nullif(v_customer.id, null), v_points) on conflict (shop_id, invoice_id) do update set customer_id = excluded.customer_id, points_earned = excluded.points_earned;
  if v_customer.id is not null then
    update public.loyalty_customers set current_points = current_points + v_points, total_points_earned = total_points_earned + v_points, total_spent = total_spent + v_invoice.total, updated_at = now() where id = v_customer.id and shop_id = p_shop_id;
    update public.invoices set loyalty_customer_id = v_customer.id, loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id;
  else update public.invoices set loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id; end if;
  return jsonb_build_object('invoice_id', p_invoice_id, 'customer_id', v_customer.id, 'points_earned', v_points, 'sale_type', v_invoice.sale_type);
end;
$$;

revoke all on function public.create_product(uuid, jsonb), public.update_product(uuid, uuid, bigint, jsonb), public.apply_invoice_loyalty(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_product(uuid, jsonb), public.update_product(uuid, uuid, bigint, jsonb), public.apply_invoice_loyalty(uuid, uuid, text, text) to authenticated;
notify pgrst, 'reload schema';
