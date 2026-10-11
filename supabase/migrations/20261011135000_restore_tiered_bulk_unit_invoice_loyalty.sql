begin;

-- Keep server-authoritative tiered points and the configured bulk-unit multiplier
-- together after the tiered-pricing migration. This routine is only invoked from
-- the atomic complete_invoice_intent RPC; clients must not call it directly.
create or replace function public.apply_invoice_loyalty(
  p_shop_id uuid,
  p_invoice_id uuid,
  p_customer_name text,
  p_customer_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices%rowtype;
  v_customer public.loyalty_customers%rowtype;
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]+', '', 'g');
  v_points numeric(18,2) := 0;
  v_item record;
  v_item_points numeric(18,2);
  v_code text;
begin
  select * into v_invoice
    from public.invoices
   where id = p_invoice_id and shop_id = p_shop_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;

  select * into v_customer
    from public.loyalty_customers
   where shop_id = p_shop_id
     and deleted_at is null
     and v_phone <> ''
     and regexp_replace(phone, '[^0-9]+', '', 'g') = v_phone
   order by created_at asc
   limit 1
   for update;
  if not found and v_phone <> '' then
    v_code := 'POS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    insert into public.loyalty_customers(shop_id, customer_code, full_name, phone)
    values (
      p_shop_id,
      v_code,
      left(coalesce(nullif(trim(p_customer_name), ''), 'عميل الكاشير'), 180),
      left(coalesce(p_customer_phone, ''), 40)
    )
    returning * into v_customer;
  end if;

  for v_item in
    select ii.*,
      case v_invoice.sale_type
        when 'wholesale' then coalesce(p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points)
        when 'bulk' then coalesce(p.wholesale_loyalty_points, p.sub_wholesale_loyalty_points, p.retail_loyalty_points, p.loyalty_points)
        else coalesce(p.retail_loyalty_points, p.loyalty_points)
      end::numeric as product_points,
      p.bulk_unit_name,
      p.units_per_bulk
    from public.invoice_items ii
    left join public.products p on p.id = ii.product_id and p.shop_id = ii.shop_id
    where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id
    order by ii.id
  loop
    v_item_points := floor(
      coalesce(v_item.product_points, 0)
      * v_item.quantity
      * case
          when v_item.bulk_unit_name is not null
           and v_item.selected_unit_snapshot = v_item.bulk_unit_name
          then coalesce(v_item.units_per_bulk, 1)
          else 1
        end
      * 100
    ) / 100;

    update public.invoice_items
       set loyalty_points_snapshot = v_item_points
     where id = v_item.id and shop_id = p_shop_id;
    v_points := v_points + v_item_points;

    if v_customer.id is not null and v_item_points > 0 then
      insert into public.loyalty_point_ledger(
        shop_id, customer_id, invoice_id, invoice_item_id, points_delta,
        entry_type, description, created_by
      )
      values (
        p_shop_id, v_customer.id, p_invoice_id, v_item.id, v_item_points,
        'invoice_earned', 'نقاط مكتسبة من الفاتورة ' || v_invoice.invoice_number,
        v_invoice.created_by
      )
      on conflict do nothing;
    end if;
  end loop;

  insert into public.invoice_loyalty_points(shop_id, invoice_id, customer_id, points_earned)
  values (p_shop_id, p_invoice_id, nullif(v_customer.id, null), v_points)
  on conflict (shop_id, invoice_id) do update
    set customer_id = excluded.customer_id,
        points_earned = excluded.points_earned;

  if v_customer.id is not null then
    update public.loyalty_customers
       set current_points = current_points + v_points,
           total_points_earned = total_points_earned + v_points,
           total_spent = total_spent + v_invoice.total,
           updated_at = now()
     where id = v_customer.id and shop_id = p_shop_id;
    update public.invoices
       set loyalty_customer_id = v_customer.id,
           loyalty_points_awarded = floor(v_points)::integer
     where id = p_invoice_id and shop_id = p_shop_id;
  else
    update public.invoices
       set loyalty_points_awarded = floor(v_points)::integer
     where id = p_invoice_id and shop_id = p_shop_id;
  end if;

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'customer_id', v_customer.id,
    'points_earned', v_points,
    'sale_type', v_invoice.sale_type
  );
end;
$$;

-- The invoice intent RPC is the sole authorized entry point for this write path.
revoke all on function public.apply_invoice_loyalty(uuid, uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
