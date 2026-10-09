create or replace function public.void_invoice(p_shop_id uuid, p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_status public.invoice_status;
  v_invoice_number text;
  v_loyalty_points integer;
  v_item record;
  v_updated_product_id uuid;
  v_products_restored integer := 0;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'INVOICE_VOID_FORBIDDEN';
  end if;

  select i.*
    into v_invoice
  from public.invoices i
  where i.id = p_invoice_id and i.shop_id = p_shop_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND';
  end if;

  v_status := v_invoice.status;
  v_invoice_number := v_invoice.invoice_number;
  v_loyalty_points := v_invoice.loyalty_points_awarded;

  if v_status = 'voided' then
    return jsonb_build_object(
      'invoice_id', p_invoice_id,
      'status', 'voided',
      'idempotent_replay', true
    );
  end if;

  if v_status <> 'completed' then
    raise exception using errcode = '22023', message = 'INVOICE_STATUS_CANNOT_BE_VOIDED';
  end if;

  -- Do not alter inventory unless awarded points can also be reversed atomically.
  if coalesce(v_loyalty_points, 0) > 0 then
    raise exception using errcode = '55000', message = 'LOYALTY_REVERSAL_REQUIRES_CLOUD_LEDGER';
  end if;

  -- Aggregate duplicate product lines and lock/update products in a stable order.
  for v_item in
    select ii.product_id, sum(ii.stock_quantity_delta)::numeric as quantity_delta
    from public.invoice_items ii
    where ii.invoice_id = p_invoice_id
      and ii.shop_id = p_shop_id
      and ii.product_id is not null
      and ii.stock_quantity_delta > 0
    group by ii.product_id
    order by ii.product_id
  loop
    update public.products p
    set quantity = p.quantity + v_item.quantity_delta,
        version = p.version + 1,
        updated_at = now(),
        updated_by = v_actor
    where p.id = v_item.product_id
      and p.shop_id = p_shop_id
    returning p.id into v_updated_product_id;

    if not found then
      raise exception using errcode = 'P0002', message = 'INVOICE_PRODUCT_NOT_FOUND';
    end if;

    insert into public.stock_movements(
      shop_id, product_id, invoice_id, kind, quantity_delta, reason, created_by
    ) values (
      p_shop_id,
      v_item.product_id,
      p_invoice_id,
      'return',
      v_item.quantity_delta,
      left('إبطال فاتورة ' || v_invoice_number || ' وإعادة المخزون', 500),
      v_actor
    );
    v_products_restored := v_products_restored + 1;
  end loop;

  update public.invoices
  set status = 'voided'
  where id = p_invoice_id and shop_id = p_shop_id and status = 'completed';

  if not found then
    raise exception using errcode = '40001', message = 'INVOICE_STATUS_CONFLICT';
  end if;

  insert into public.audit_events(
    shop_id, actor_id, action, entity_type, entity_id, changed_fields, details
  ) values (
    p_shop_id,
    v_actor,
    'invoice.voided',
    'invoice',
    p_invoice_id,
    array['status'],
    jsonb_build_object('invoice_number', v_invoice_number, 'restored_product_count', v_products_restored)
  );

  return jsonb_build_object(
    'invoice_id', p_invoice_id,
    'status', 'voided',
    'idempotent_replay', false,
    'restored_product_count', v_products_restored
  );
end;
$$;

revoke all on function public.void_invoice(uuid, uuid) from public, anon, authenticated;
grant execute on function public.void_invoice(uuid, uuid) to authenticated;
