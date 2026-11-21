begin;

create or replace function public.register_purchase_raffle_ticket(
  p_raffle_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_invoice_code text
)
returns table(ticket_id uuid, ticket_number text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raffle public.purchase_raffles%rowtype;
  v_invoice public.invoices%rowtype;
  v_order public.catalog_orders%rowtype;
  v_sale jsonb;
  v_phone text;
  v_code text;
  v_input_code text;
  v_id uuid;
  v_number text;
  v_rule jsonb;
  v_need numeric;
  v_product_id uuid;
  v_name text;
  v_category text;
  v_source text;
  v_total numeric;
  v_items jsonb;
  v_matches integer := 0;
  v_candidates text[];
begin
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_input_code := lower(regexp_replace(coalesce(p_invoice_code, ''), '[#[:space:]]+', '', 'g'));

  if length(trim(coalesce(p_customer_name, ''))) not between 1 and 120
    or length(v_phone) not between 7 and 15
    or length(v_input_code) < 4 then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_OR_INVOICE';
  end if;

  select * into v_raffle
  from public.purchase_raffles
  where id = p_raffle_id and status = 'active'
  for update;
  if not found or v_raffle.ends_at <= now() then
    raise exception using errcode = 'P0002', message = 'RAFFLE_NOT_ACTIVE';
  end if;

  -- Prefer an invoice's public invoice number, while also accepting a cleaned UUID prefix.
  select count(*) into v_matches
  from public.invoices i
  where i.shop_id = v_raffle.shop_id
    and i.status = 'completed'
    and (
      left(lower(regexp_replace(coalesce(i.invoice_number, ''), '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code
      or left(lower(i.id::text), length(v_input_code)) = v_input_code
      or left(lower(replace(i.id::text, '-', '')), length(replace(v_input_code, '-', ''))) = replace(v_input_code, '-', '')
    );
  if v_matches > 1 then
    raise exception using errcode = '22023', message = 'INVOICE_CODE_AMBIGUOUS';
  elsif v_matches = 1 then
    select i.* into v_invoice
    from public.invoices i
    where i.shop_id = v_raffle.shop_id
      and i.status = 'completed'
      and (
        left(lower(regexp_replace(coalesce(i.invoice_number, ''), '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code
        or left(lower(i.id::text), length(v_input_code)) = v_input_code
        or left(lower(replace(i.id::text, '-', '')), length(replace(v_input_code, '-', ''))) = replace(v_input_code, '-', '')
      )
    limit 1;
    v_source := 'invoice';
    v_total := v_invoice.total;
    v_code := lower(regexp_replace(coalesce(nullif(v_invoice.invoice_number, ''), replace(v_invoice.id::text, '-', '')), '[#[:space:]]+', '', 'g'));
  end if;

  -- Catalog order IDs are UUIDs; optional invoice/order code fields are inspected as JSON
  -- so this stays compatible with deployments that add an explicit human-readable code.
  if v_source is null then
    select count(*) into v_matches
    from public.catalog_orders o
    where o.shop_id = v_raffle.shop_id
      and lower(coalesce(to_jsonb(o)->>'status', 'pending')) not in ('cancelled', 'canceled', 'voided', 'deleted')
      and exists (
        select 1 from unnest(array[
          to_jsonb(o)->>'id', to_jsonb(o)->>'invoice_number', to_jsonb(o)->>'invoice_code',
          to_jsonb(o)->>'order_number', to_jsonb(o)->>'code'
        ]) as candidate(value)
        where candidate.value is not null
          and left(lower(regexp_replace(candidate.value, '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code
      );
    if v_matches > 1 then
      raise exception using errcode = '22023', message = 'INVOICE_CODE_AMBIGUOUS';
    elsif v_matches = 1 then
      select o.* into v_order
      from public.catalog_orders o
      where o.shop_id = v_raffle.shop_id
        and lower(coalesce(to_jsonb(o)->>'status', 'pending')) not in ('cancelled', 'canceled', 'voided', 'deleted')
        and exists (
          select 1 from unnest(array[
            to_jsonb(o)->>'id', to_jsonb(o)->>'invoice_number', to_jsonb(o)->>'invoice_code',
            to_jsonb(o)->>'order_number', to_jsonb(o)->>'code'
          ]) as candidate(value)
          where candidate.value is not null
            and left(lower(regexp_replace(candidate.value, '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code
        )
      limit 1;
      v_source := 'catalog_order';
      v_total := v_order.total_amount;
      v_items := v_order.items;
      v_candidates := array[
        to_jsonb(v_order)->>'invoice_number', to_jsonb(v_order)->>'invoice_code',
        to_jsonb(v_order)->>'order_number', to_jsonb(v_order)->>'code', v_order.id::text
      ];
      select lower(regexp_replace(candidate, '[#[:space:]]+', '', 'g')) into v_code
      from unnest(v_candidates) as candidate
      where candidate is not null
      order by case when left(lower(regexp_replace(candidate, '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code then 0 else 1 end
      limit 1;
    end if;
  end if;

  -- Some deployments use a separate sales table; it is optional and its columns vary.
  -- JSON row inspection avoids referencing columns that may not exist in that schema.
  if v_source is null and pg_catalog.to_regclass('public.sales') is not null then
    execute $query$
      select count(*)::integer, (array_agg(to_jsonb(s)))[1]
      from public.sales s
      where lower(coalesce(to_jsonb(s)->>'status', 'completed')) not in ('void', 'voided', 'cancelled', 'canceled', 'deleted', 'draft')
        and exists (
          select 1 from unnest(array[
            to_jsonb(s)->>'id', to_jsonb(s)->>'invoice_number', to_jsonb(s)->>'invoice_code',
            to_jsonb(s)->>'sale_number', to_jsonb(s)->>'code'
          ]) as candidate(value)
          where candidate.value is not null
            and left(lower(regexp_replace(candidate.value, '[#[:space:]]+', '', 'g')), length($1)) = $1
        )
    $query$ into v_matches, v_sale using v_input_code;
    if v_matches > 1 then
      raise exception using errcode = '22023', message = 'INVOICE_CODE_AMBIGUOUS';
    elsif v_matches = 1 then
      v_source := 'sale';
      v_items := coalesce(v_sale->'items', v_sale->'invoice_items', v_sale->'line_items', '[]'::jsonb);
      v_total := coalesce(
        case when coalesce(v_sale->>'total', '') ~ '^[0-9]+(\.[0-9]+)?$' then (v_sale->>'total')::numeric end,
        case when coalesce(v_sale->>'total_amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (v_sale->>'total_amount')::numeric end,
        case when coalesce(v_sale->>'grand_total', '') ~ '^[0-9]+(\.[0-9]+)?$' then (v_sale->>'grand_total')::numeric end,
        case when coalesce(v_sale->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (v_sale->>'amount')::numeric end,
        0
      );
      v_candidates := array[
        v_sale->>'invoice_number', v_sale->>'invoice_code', v_sale->>'sale_number',
        v_sale->>'code', v_sale->>'id'
      ];
      select lower(regexp_replace(candidate, '[#[:space:]]+', '', 'g')) into v_code
      from unnest(v_candidates) as candidate
      where candidate is not null
      order by case when left(lower(regexp_replace(candidate, '[#[:space:]]+', '', 'g')), length(v_input_code)) = v_input_code then 0 else 1 end
      limit 1;
    end if;
  end if;

  if v_source is null then
    raise exception using errcode = '22023', message = 'INVOICE_NOT_FOUND';
  end if;

  if v_raffle.min_invoice_total is not null and v_total < v_raffle.min_invoice_total then
    raise exception using errcode = '22023', message = 'INVOICE_TOTAL_BELOW_MINIMUM';
  end if;
  if v_raffle.required_products_rules ? 'min_invoice_total'
    and v_total < (v_raffle.required_products_rules->>'min_invoice_total')::numeric then
    raise exception using errcode = '22023', message = 'INVOICE_TOTAL_BELOW_RULE';
  end if;

  if v_raffle.required_products_rules ? 'items' then
    for v_rule in select value from jsonb_array_elements(v_raffle.required_products_rules->'items') loop
      v_need := greatest(1, coalesce((v_rule->>'min_quantity')::numeric, 1));
      v_product_id := nullif(v_rule->>'product_id', '')::uuid;
      v_name := nullif(trim(v_rule->>'name'), '');
      if v_product_id is null and v_name is null then
        raise exception using errcode = '22023', message = 'INVALID_RAFFLE_PRODUCT_RULE';
      end if;
      if v_source = 'invoice' then
        if coalesce((
          select sum(ii.quantity)
          from public.invoice_items ii
          where ii.invoice_id = v_invoice.id
            and ((v_product_id is not null and ii.product_id = v_product_id)
              or (v_name is not null and lower(ii.product_name_snapshot) = lower(v_name)))
        ), 0) < v_need then
          raise exception using errcode = '22023', message = 'REQUIRED_PRODUCT_NOT_IN_INVOICE';
        end if;
      elsif jsonb_typeof(v_items) = 'array' then
        if coalesce((
          select sum(coalesce(nullif(item.value->>'quantity', '')::numeric, 1))
          from jsonb_array_elements(v_items) as item(value)
          where (v_product_id is not null and coalesce(item.value->>'product_id', item.value->>'productId') = v_product_id::text)
            or (v_name is not null and lower(coalesce(item.value->>'name', item.value->>'product_name', item.value->>'productName', '')) = lower(v_name))
        ), 0) < v_need then
          raise exception using errcode = '22023', message = 'REQUIRED_PRODUCT_NOT_IN_INVOICE';
        end if;
      else
        raise exception using errcode = '22023', message = 'REQUIRED_PRODUCT_NOT_IN_INVOICE';
      end if;
    end loop;
  end if;

  if v_raffle.required_products_rules ? 'category_ids' then
    for v_category in select jsonb_array_elements_text(v_raffle.required_products_rules->'category_ids') loop
      if v_source = 'invoice' then
        if not exists (
          select 1 from public.invoice_items ii
          join public.products p on p.id = ii.product_id and p.shop_id = v_invoice.shop_id
          where ii.invoice_id = v_invoice.id and p.category_id::text = v_category
        ) then
          raise exception using errcode = '22023', message = 'REQUIRED_CATEGORY_NOT_IN_INVOICE';
        end if;
      elsif not exists (
        select 1 from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) as item(value)
        join public.products p on p.id::text = coalesce(item.value->>'product_id', item.value->>'productId') and p.shop_id = v_raffle.shop_id
        where p.category_id::text = v_category
      ) then
        raise exception using errcode = '22023', message = 'REQUIRED_CATEGORY_NOT_IN_INVOICE';
      end if;
    end loop;
  end if;

  if v_raffle.required_products_rules ? 'category_names' then
    for v_category in select jsonb_array_elements_text(v_raffle.required_products_rules->'category_names') loop
      if v_source = 'invoice' then
        if not exists (
          select 1 from public.invoice_items ii
          join public.products p on p.id = ii.product_id and p.shop_id = v_invoice.shop_id
          join public.product_categories c on c.id = p.category_id and c.shop_id = v_invoice.shop_id
          where ii.invoice_id = v_invoice.id and lower(c.name) = lower(v_category)
        ) then
          raise exception using errcode = '22023', message = 'REQUIRED_CATEGORY_NOT_IN_INVOICE';
        end if;
      elsif not exists (
        select 1 from jsonb_array_elements(coalesce(v_items, '[]'::jsonb)) as item(value)
        join public.products p on p.id::text = coalesce(item.value->>'product_id', item.value->>'productId') and p.shop_id = v_raffle.shop_id
        join public.product_categories c on c.id = p.category_id and c.shop_id = v_raffle.shop_id
        where lower(c.name) = lower(v_category)
      ) then
        raise exception using errcode = '22023', message = 'REQUIRED_CATEGORY_NOT_IN_INVOICE';
      end if;
    end loop;
  end if;

  if exists (
    select 1 from public.raffle_tickets t
    where t.raffle_id = v_raffle.id
      and lower(regexp_replace(coalesce(t.invoice_code, ''), '[#[:space:]]+', '', 'g')) = v_code
  ) then
    raise exception using errcode = '23505', message = 'INVOICE_ALREADY_USED';
  end if;

  v_number := '#R-' || nextval('public.purchase_raffle_ticket_number_seq')::text;
  insert into public.raffle_tickets(shop_id, raffle_id, customer_name, customer_phone, invoice_code, ticket_number)
  values(v_raffle.shop_id, v_raffle.id, trim(p_customer_name), v_phone, v_code, v_number)
  returning id into v_id;
  return query select v_id, v_number;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'INVOICE_ALREADY_USED';
end;
$$;

revoke all on function public.register_purchase_raffle_ticket(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.register_purchase_raffle_ticket(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
commit;
