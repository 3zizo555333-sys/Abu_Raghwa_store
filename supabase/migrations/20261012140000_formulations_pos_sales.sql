begin;

-- A deliberately narrow catalog projection lets every shop member sell a formula
-- without exposing recipe costs, password hashes, notes or ingredient details.
create or replace view public.pos_formulations
with (security_barrier = true)
as
select id, shop_id, name, retail_price, production_unit, loyalty_points, image_url, updated_at
from public.recipes
where deleted_at is null and public.is_shop_member(shop_id);
revoke all on public.pos_formulations from public, anon;
grant select on public.pos_formulations to authenticated;

alter table public.invoice_items
  add column if not exists formulation_id uuid references public.recipes(id) on delete set null;
create index if not exists invoice_items_formulation_idx
  on public.invoice_items(shop_id, formulation_id) where formulation_id is not null;

-- Keep the existing per-shop invoice views, now with the nullable formula link.
create or replace view public.seller_invoice_items with (security_barrier = true) as
  select id, invoice_id, shop_id, product_id, formulation_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, line_total, created_at
  from public.invoice_items where public.is_shop_member(shop_id);
create or replace view public.manager_invoice_items with (security_barrier = true) as
  select id, invoice_id, shop_id, product_id, formulation_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, unit_cost_snapshot, line_total, created_at
  from public.invoice_items where public.is_shop_member(shop_id) and public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]);
revoke all on public.seller_invoice_items, public.manager_invoice_items from public, anon, authenticated;
grant select on public.seller_invoice_items, public.manager_invoice_items to authenticated;

-- Keep product sales unchanged; formula lines are validated against this shop's
-- live recipe and use server-owned price/cost/points. Formulas do not consume
-- packaged-product stock and therefore create no stock movement.
create or replace function public.create_invoice_with_stock(
  p_shop_id uuid,
  p_idempotency_key uuid,
  p_items jsonb,
  p_sale_type text default 'retail',
  p_payment_method text default 'cash',
  p_customer_name text default '',
  p_customer_phone text default '',
  p_discount_type text default 'fixed',
  p_discount_value numeric default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invoice_id uuid;
  v_invoice_number text;
  v_item jsonb;
  v_product public.products;
  v_recipe public.recipes;
  v_product_id uuid;
  v_formulation_id uuid;
  v_qty numeric(18,6);
  v_unit text;
  v_price numeric(18,4);
  v_cost numeric(18,4);
  v_stock_delta numeric(18,6);
  v_line_total numeric(18,4);
  v_subtotal numeric(18,4) := 0;
  v_discount numeric(18,4) := 0;
  v_total numeric(18,4) := 0;
  v_units numeric(18,6);
  v_outer boolean;
  v_bulk boolean;
begin
  if not public.is_shop_member(p_shop_id) then raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED'; end if;
  if coalesce(p_sale_type,'') not in ('retail','wholesale','bulk') or coalesce(p_discount_type,'') not in ('percent','fixed') or p_discount_value < 0 or (p_discount_type = 'percent' and p_discount_value > 100) then raise exception using errcode = '22023', message = 'INVALID_INVOICE'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then raise exception using errcode = '22023', message = 'INVALID_INVOICE_ITEMS'; end if;
  insert into public.invoices(shop_id, invoice_number, idempotency_key, sale_type, payment_method, customer_name, customer_phone, subtotal, discount_type, discount_value, discount_amount, total, created_by)
  values (p_shop_id, 'pending-' || p_idempotency_key::text, p_idempotency_key, p_sale_type, p_payment_method, left(coalesce(p_customer_name,''),255), left(coalesce(p_customer_phone,''),32), 0, p_discount_type, p_discount_value, 0, 0, (select auth.uid()))
  on conflict (shop_id, idempotency_key) do nothing returning id into v_invoice_id;
  if v_invoice_id is null then
    select id, invoice_number, subtotal, discount_amount, total into v_invoice_id, v_invoice_number, v_subtotal, v_discount, v_total
      from public.invoices where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
    return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'subtotal', v_subtotal, 'discount_amount', v_discount, 'total', v_total, 'idempotent_replay', true);
  end if;
  v_invoice_number := 'INV-' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISSMS') || '-' || substr(replace(v_invoice_id::text, '-', ''), 1, 6);
  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    v_qty := nullif(v_item->>'quantity','')::numeric;
    v_unit := coalesce(nullif(trim(v_item->>'selected_unit_type'), ''), '');
    if v_qty is null or v_qty <= 0 then raise exception using errcode = '22023', message = 'INVALID_INVOICE_QUANTITY'; end if;
    v_formulation_id := nullif(v_item->>'formulation_id','')::uuid;
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    if v_formulation_id is not null and v_product_id is distinct from v_formulation_id then raise exception using errcode = '22023', message = 'INVALID_FORMULATION_REFERENCE'; end if;
    if v_formulation_id is null then
      select * into v_product from public.products where id = v_product_id and shop_id = p_shop_id and deleted_at is null for update;
    else
      v_product := null;
    end if;
    if v_formulation_id is null and found then
      v_formulation_id := null;
      v_units := greatest(v_product.units_per_package, 0.000001);
      v_bulk := nullif(btrim(v_product.bulk_unit_name), '') is not null and v_unit = btrim(v_product.bulk_unit_name);
      v_outer := v_unit = v_product.unit_name;
      if v_bulk then
        if v_product.bulk_unit_price is null or v_product.bulk_unit_price <= 0 or v_product.units_per_bulk <= 0 then raise exception using errcode = '22023', message = 'INVALID_BULK_PACKAGING'; end if;
        v_stock_delta := (v_qty * v_product.units_per_bulk) / v_units;
      elsif v_outer then v_stock_delta := v_qty;
      elsif v_unit = v_product.content_unit then v_stock_delta := v_qty / v_units;
      else raise exception using errcode = '22023', message = 'INVALID_PRODUCT_UNIT'; end if;
      if v_product.quantity < v_stock_delta then raise exception using errcode = 'P0001', message = 'INSUFFICIENT_STOCK:' || v_product.name; end if;
      if v_bulk then
        v_price := v_product.bulk_unit_price;
        v_cost := coalesce(nullif(v_product.cost_per_piece,0), nullif(v_product.wholesale_price_per_piece,0), nullif(v_product.cost_per_unit,0) / v_units, nullif(v_product.wholesale_price_per_unit,0) / v_units, 0) * v_product.units_per_bulk;
      else
        v_price := case p_sale_type when 'wholesale' then coalesce(nullif(v_product.wholesale_retail_price,0), v_product.retail_price) when 'bulk' then coalesce(nullif(v_product.bulk_price,0), nullif(v_product.wholesale_retail_price,0), v_product.retail_price) else v_product.retail_price end;
        if v_outer then v_price := v_price * v_units; end if;
        v_cost := case when v_outer then coalesce(nullif(v_product.wholesale_price_per_unit,0), v_product.cost_per_piece * v_units) else coalesce(nullif(v_product.cost_per_piece,0), v_product.cost_per_unit) end;
      end if;
      v_line_total := round(v_qty * v_price, 4);
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items(invoice_id, shop_id, product_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, unit_cost_snapshot, line_total)
      values (v_invoice_id, p_shop_id, v_product.id, v_product.name, v_product.code, v_unit, v_product.sale_mode, v_qty, v_stock_delta, v_price, v_cost, v_line_total);
      update public.products set quantity = quantity - v_stock_delta, version = version + 1, updated_at = now(), updated_by = (select auth.uid()) where id = v_product.id and shop_id = p_shop_id;
      insert into public.stock_movements(shop_id, product_id, invoice_id, kind, quantity_delta, reason, created_by)
      values (p_shop_id, v_product.id, v_invoice_id, 'sale', -v_stock_delta, 'بيع ' || v_invoice_id::text, (select auth.uid()));
    else
      -- A formula must be explicitly identified; a missing product UUID alone is never enough.
      if v_formulation_id is null then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_AVAILABLE'; end if;
      select * into v_recipe from public.recipes where id = v_product_id and shop_id = p_shop_id and deleted_at is null for update;
      if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_OR_FORMULATION_NOT_AVAILABLE'; end if;
      if v_unit <> v_recipe.production_unit then raise exception using errcode = '22023', message = 'INVALID_FORMULATION_UNIT'; end if;
      v_formulation_id := v_recipe.id;
      v_price := v_recipe.retail_price;
      v_cost := case when v_recipe.production_quantity > 0 then v_recipe.cost_price / v_recipe.production_quantity else v_recipe.cost_price end;
      if v_price <= 0 then raise exception using errcode = '22023', message = 'INVALID_FORMULATION_PRICE'; end if;
      v_stock_delta := 0;
      v_line_total := round(v_qty * v_price, 4);
      v_subtotal := v_subtotal + v_line_total;
      insert into public.invoice_items(invoice_id, shop_id, product_id, formulation_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, unit_cost_snapshot, line_total)
      values (v_invoice_id, p_shop_id, null, v_formulation_id, v_recipe.name, null, v_unit, 'unit', v_qty, 0, v_price, v_cost, v_line_total);
    end if;
  end loop;
  v_discount := case when p_discount_type = 'percent' then round(v_subtotal * p_discount_value / 100,4) else least(v_subtotal, p_discount_value) end;
  v_total := greatest(0, v_subtotal - v_discount);
  update public.invoices set invoice_number = v_invoice_number, subtotal = v_subtotal, discount_amount = v_discount, total = v_total where id = v_invoice_id;
  return jsonb_build_object('invoice_id', v_invoice_id, 'invoice_number', v_invoice_number, 'subtotal', v_subtotal, 'discount_amount', v_discount, 'total', v_total, 'idempotent_replay', false);
end;
$$;

-- Points are server-authoritative for both products and formulations. Formulas
-- record points per sold production unit and participate in the existing ledger.
create or replace function public.apply_invoice_loyalty(p_shop_id uuid, p_invoice_id uuid, p_customer_name text, p_customer_phone text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_invoice public.invoices%rowtype;
  v_customer public.loyalty_customers%rowtype;
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]+', '', 'g');
  v_points numeric(18,2) := 0;
  v_item record;
  v_item_points numeric(18,2);
  v_code text;
begin
  select * into v_invoice from public.invoices where id = p_invoice_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND'; end if;
  select * into v_customer from public.loyalty_customers where shop_id = p_shop_id and deleted_at is null and v_phone <> '' and regexp_replace(phone, '[^0-9]+', '', 'g') = v_phone order by created_at asc limit 1 for update;
  if not found and v_phone <> '' then
    v_code := 'POS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.loyalty_customers(shop_id, customer_code, full_name, phone) values (p_shop_id, v_code, left(coalesce(nullif(trim(p_customer_name), ''), 'عميل الكاشير'), 180), left(coalesce(p_customer_phone, ''), 40)) returning * into v_customer;
  end if;
  for v_item in
    select ii.*, case v_invoice.sale_type when 'wholesale' then coalesce(p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points) when 'bulk' then coalesce(p.wholesale_loyalty_points, p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points) else coalesce(p.retail_loyalty_points, p.loyalty_points) end::numeric as product_points,
      p.bulk_unit_name, p.units_per_bulk, r.loyalty_points as formula_points
    from public.invoice_items ii left join public.products p on p.id = ii.product_id and p.shop_id = ii.shop_id
    left join public.recipes r on r.id = ii.formulation_id and r.shop_id = ii.shop_id
    where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id order by ii.id
  loop
    v_item_points := floor(coalesce(v_item.product_points, v_item.formula_points, 0) * v_item.quantity * case when v_item.formulation_id is null and v_item.bulk_unit_name is not null and v_item.selected_unit_snapshot = v_item.bulk_unit_name then coalesce(v_item.units_per_bulk, 1) else 1 end * 100) / 100;
    update public.invoice_items set loyalty_points_snapshot = v_item_points where id = v_item.id and shop_id = p_shop_id;
    v_points := v_points + v_item_points;
    if v_customer.id is not null and v_item_points > 0 then
      insert into public.loyalty_point_ledger(shop_id, customer_id, invoice_id, invoice_item_id, points_delta, entry_type, description, created_by)
      values (p_shop_id, v_customer.id, p_invoice_id, v_item.id, v_item_points, 'invoice_earned', 'نقاط مكتسبة من الفاتورة ' || v_invoice.invoice_number, v_invoice.created_by) on conflict do nothing;
    end if;
  end loop;
  insert into public.invoice_loyalty_points(shop_id, invoice_id, customer_id, points_earned) values (p_shop_id, p_invoice_id, v_customer.id, v_points)
  on conflict (shop_id, invoice_id) do update set customer_id = excluded.customer_id, points_earned = excluded.points_earned;
  if v_customer.id is not null then
    update public.loyalty_customers set current_points = current_points + v_points, total_points_earned = total_points_earned + v_points, total_spent = total_spent + v_invoice.total, updated_at = now() where id = v_customer.id and shop_id = p_shop_id;
    update public.invoices set loyalty_customer_id = v_customer.id, loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id;
  else
    update public.invoices set loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id;
  end if;
  return jsonb_build_object('invoice_id', p_invoice_id, 'customer_id', v_customer.id, 'points_earned', v_points, 'sale_type', v_invoice.sale_type);
end;
$$;

revoke all on function public.apply_invoice_loyalty(uuid, uuid, text, text) from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
