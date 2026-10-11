begin;

-- Additive schema only: no existing business rows are deleted or rewritten.
alter table public.invoices
  add column if not exists loyalty_customer_id uuid;

alter table public.invoice_items
  add column if not exists loyalty_points_snapshot numeric(18,2) not null default 0;

create table if not exists public.invoice_loyalty_points (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  invoice_id uuid not null,
  customer_id uuid,
  points_earned numeric(18,2) not null default 0 check (points_earned >= 0),
  created_at timestamptz not null default now(),
  unique (shop_id, invoice_id),
  foreign key (invoice_id, shop_id) references public.invoices(id, shop_id) on delete restrict,
  foreign key (customer_id, shop_id) references public.loyalty_customers(id, shop_id) on delete restrict
);

create table if not exists public.invoice_returns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  invoice_id uuid not null,
  customer_id uuid,
  idempotency_key uuid not null,
  status text not null default 'completed' check (status = 'completed'),
  refund_total numeric(18,4) not null default 0 check (refund_total >= 0),
  points_reversed numeric(18,2) not null default 0 check (points_reversed >= 0),
  reason text not null default '' check (length(reason) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (shop_id, idempotency_key),
  unique (id, shop_id),
  foreign key (invoice_id, shop_id) references public.invoices(id, shop_id) on delete restrict,
  foreign key (customer_id, shop_id) references public.loyalty_customers(id, shop_id) on delete restrict
);

create table if not exists public.invoice_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null,
  shop_id uuid not null,
  invoice_item_id uuid not null,
  product_id uuid,
  product_name_snapshot text not null,
  quantity numeric(18,6) not null check (quantity > 0),
  stock_quantity_delta numeric(18,6) not null check (stock_quantity_delta > 0),
  refund_amount numeric(18,4) not null check (refund_amount >= 0),
  points_reversed numeric(18,2) not null check (points_reversed >= 0),
  created_at timestamptz not null default now(),
  unique (return_id, invoice_item_id),
  foreign key (return_id, shop_id) references public.invoice_returns(id, shop_id) on delete restrict,
  foreign key (invoice_item_id) references public.invoice_items(id) on delete restrict,
  foreign key (product_id, shop_id) references public.products(id, shop_id) on delete restrict
);

alter table public.invoices
  add constraint invoices_loyalty_customer_fk
  foreign key (loyalty_customer_id, shop_id)
  references public.loyalty_customers(id, shop_id)
  on delete set null;

alter table public.stock_movements
  add column if not exists return_id uuid;
alter table public.stock_movements
  add constraint stock_movements_return_fk
  foreign key (return_id, shop_id)
  references public.invoice_returns(id, shop_id)
  on delete set null;

create table if not exists public.loyalty_point_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_id uuid not null,
  invoice_id uuid,
  invoice_item_id uuid,
  return_id uuid,
  points_delta numeric(18,2) not null check (points_delta <> 0),
  entry_type text not null check (entry_type in ('invoice_earned', 'return_reversed', 'manual_adjustment')),
  description text not null default '' check (length(description) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (customer_id, shop_id) references public.loyalty_customers(id, shop_id) on delete restrict,
  foreign key (invoice_id, shop_id) references public.invoices(id, shop_id) on delete restrict,
  foreign key (return_id, shop_id) references public.invoice_returns(id, shop_id) on delete restrict,
  foreign key (invoice_item_id) references public.invoice_items(id) on delete restrict
);

create index if not exists invoice_loyalty_points_invoice_idx on public.invoice_loyalty_points(shop_id, invoice_id);
create index if not exists invoice_return_items_invoice_idx on public.invoice_return_items(shop_id, invoice_item_id);
create index if not exists loyalty_point_ledger_customer_idx on public.loyalty_point_ledger(shop_id, customer_id, created_at desc);
create index if not exists stock_movements_return_idx on public.stock_movements(shop_id, return_id);
create unique index if not exists loyalty_point_ledger_invoice_item_sale_uidx on public.loyalty_point_ledger(shop_id, invoice_item_id) where entry_type = 'invoice_earned';
create unique index if not exists loyalty_point_ledger_return_item_uidx on public.loyalty_point_ledger(shop_id, return_id, invoice_item_id) where entry_type = 'return_reversed';

alter table public.invoice_loyalty_points enable row level security;
alter table public.invoice_loyalty_points force row level security;
alter table public.invoice_returns enable row level security;
alter table public.invoice_returns force row level security;
alter table public.invoice_return_items enable row level security;
alter table public.invoice_return_items force row level security;
alter table public.loyalty_point_ledger enable row level security;
alter table public.loyalty_point_ledger force row level security;

create policy invoice_loyalty_points_member_read on public.invoice_loyalty_points for select to authenticated using (public.is_shop_member(shop_id));
create policy invoice_returns_manager_read on public.invoice_returns for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy invoice_return_items_manager_read on public.invoice_return_items for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_point_ledger_manager_read on public.loyalty_point_ledger for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

revoke all on public.invoice_loyalty_points, public.invoice_returns, public.invoice_return_items, public.loyalty_point_ledger from public, anon, authenticated;
grant select on public.invoice_loyalty_points, public.invoice_returns, public.invoice_return_items, public.loyalty_point_ledger to authenticated;

create or replace function public.apply_invoice_loyalty(
  p_shop_id uuid,
  p_invoice_id uuid,
  p_customer_name text,
  p_customer_phone text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
    values (p_shop_id, v_code, left(coalesce(nullif(trim(p_customer_name), ''), 'عميل الكاشير'), 180), left(coalesce(p_customer_phone, ''), 40))
    returning * into v_customer;
  end if;
  for v_item in
    select ii.*, coalesce(p.loyalty_points, 0)::numeric as product_points
      from public.invoice_items ii
      left join public.products p on p.id = ii.product_id and p.shop_id = ii.shop_id
     where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id
     order by ii.id
  loop
    v_item_points := floor(v_item.product_points * v_item.quantity * 100) / 100;
    update public.invoice_items
       set loyalty_points_snapshot = v_item_points
     where id = v_item.id and shop_id = p_shop_id;
    v_points := v_points + v_item_points;
    if v_customer.id is not null and v_item_points > 0 then
      insert into public.loyalty_point_ledger(shop_id, customer_id, invoice_id, invoice_item_id, points_delta, entry_type, description, created_by)
      values (p_shop_id, v_customer.id, p_invoice_id, v_item.id, v_item_points, 'invoice_earned', 'نقاط مكتسبة من الفاتورة ' || v_invoice.invoice_number, v_invoice.created_by)
      on conflict do nothing;
    end if;
  end loop;
  insert into public.invoice_loyalty_points(shop_id, invoice_id, customer_id, points_earned)
  values (p_shop_id, p_invoice_id, nullif(v_customer.id, null), v_points)
  on conflict (shop_id, invoice_id) do update set customer_id = excluded.customer_id, points_earned = excluded.points_earned;
  if v_customer.id is not null then
    update public.loyalty_customers
       set current_points = current_points + v_points,
           total_points_earned = total_points_earned + v_points,
           total_spent = total_spent + v_invoice.total,
           updated_at = now()
     where id = v_customer.id and shop_id = p_shop_id;
    update public.invoices set loyalty_customer_id = v_customer.id, loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id;
  else
    update public.invoices set loyalty_points_awarded = floor(v_points)::integer where id = p_invoice_id and shop_id = p_shop_id;
  end if;
  return jsonb_build_object('invoice_id', p_invoice_id, 'customer_id', v_customer.id, 'points_earned', v_points);
end;
$$;

create or replace function public.complete_invoice_intent(p_shop_id uuid, p_intent_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_intent public.invoice_intents;
  v_result jsonb;
  v_loyalty jsonb;
begin
  if v_actor_id is null or not public.is_shop_member(p_shop_id) then raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED'; end if;
  select * into v_intent from public.invoice_intents where id = p_intent_id and shop_id = p_shop_id and actor_id = v_actor_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_INTENT_NOT_FOUND'; end if;
  if v_intent.state in ('completed', 'acknowledged') then return coalesce(v_intent.invoice_result, '{}'::jsonb) || jsonb_build_object('intent_id', v_intent.id, 'intent_state', v_intent.state, 'idempotent_replay', true); end if;
  if v_intent.state <> 'pending' then raise exception using errcode = '55000', message = 'INVOICE_INTENT_NOT_PENDING'; end if;
  v_result := public.create_invoice_with_stock(p_shop_id, v_intent.idempotency_key, v_intent.payload->'items', coalesce(v_intent.payload->>'sale_type', 'retail'), coalesce(v_intent.payload->>'payment_method', 'cash'), coalesce(v_intent.payload->>'customer_name', ''), coalesce(v_intent.payload->>'customer_phone', ''), coalesce(v_intent.payload->>'discount_type', 'fixed'), coalesce(nullif(v_intent.payload->>'discount_value', '')::numeric, 0));
  v_loyalty := public.apply_invoice_loyalty(p_shop_id, (v_result->>'invoice_id')::uuid, v_intent.payload->>'customer_name', v_intent.payload->>'customer_phone');
  v_result := v_result || jsonb_build_object('loyalty_points_awarded', coalesce((v_loyalty->>'points_earned')::numeric, 0), 'loyalty_customer_id', v_loyalty->>'customer_id');
  update public.invoice_intents set state = 'completed', invoice_id = (v_result->>'invoice_id')::uuid, invoice_result = v_result, updated_at = now() where id = v_intent.id;
  return v_result || jsonb_build_object('intent_id', v_intent.id, 'intent_state', 'completed');
end;
$$;

create or replace function public.get_invoice_returnable_items(p_shop_id uuid, p_invoice_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_result jsonb;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'RETURN_READ_FORBIDDEN'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('invoice_item_id', x.invoice_item_id, 'product_id', x.product_id, 'product_name', x.product_name, 'sold_quantity', x.sold_quantity, 'returned_quantity', x.returned_quantity, 'remaining_quantity', x.remaining_quantity, 'refund_per_unit', x.refund_per_unit, 'points_earned', x.points_earned) order by x.product_name), '[]'::jsonb)
    into v_result
    from (
      select ii.id invoice_item_id, ii.product_id, ii.product_name_snapshot product_name, ii.quantity sold_quantity,
             coalesce(sum(iri.quantity) filter (where ir.status = 'completed'), 0) returned_quantity,
             greatest(0, ii.quantity - coalesce(sum(iri.quantity) filter (where ir.status = 'completed'), 0)) remaining_quantity,
             case when ii.quantity = 0 then 0 else ii.line_total / ii.quantity end refund_per_unit,
             coalesce(sum(lpl.points_delta) filter (where lpl.entry_type = 'invoice_earned'), 0) points_earned
        from public.invoice_items ii
        left join public.invoice_return_items iri on iri.invoice_item_id = ii.id and iri.shop_id = p_shop_id
        left join public.invoice_returns ir on ir.id = iri.return_id and ir.shop_id = p_shop_id
        left join public.loyalty_point_ledger lpl on lpl.invoice_item_id = ii.id and lpl.shop_id = p_shop_id and lpl.entry_type = 'invoice_earned'
       where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id
       group by ii.id
    ) x;
  return v_result;
end;
$$;

create or replace function public.create_invoice_return(p_shop_id uuid, p_invoice_id uuid, p_idempotency_key uuid, p_items jsonb, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_invoice public.invoices%rowtype;
  v_return public.invoice_returns%rowtype;
  v_item jsonb;
  v_line public.invoice_items%rowtype;
  v_product public.products%rowtype;
  v_qty numeric(18,6);
  v_already numeric(18,6);
  v_stock_delta numeric(18,6);
  v_refund numeric(18,4);
  v_sale_points numeric(18,2);
  v_points numeric(18,2);
  v_points_total numeric(18,2) := 0;
  v_total numeric(18,4) := 0;
  v_returned_all boolean;
begin
  if v_actor is null or not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode = '42501', message = 'RETURN_FORBIDDEN'; end if;
  if p_idempotency_key is null or p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 200 then raise exception using errcode = '22023', message = 'INVALID_RETURN_ITEMS'; end if;
  select * into v_return from public.invoice_returns where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('return_id', v_return.id, 'invoice_id', v_return.invoice_id, 'refund_total', v_return.refund_total, 'points_reversed', v_return.points_reversed, 'idempotent_replay', true); end if;
  select * into v_invoice from public.invoices where id = p_invoice_id and shop_id = p_shop_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'INVOICE_NOT_FOUND'; end if;
  if v_invoice.status not in ('completed', 'partially_returned') then raise exception using errcode = '22023', message = 'INVOICE_NOT_RETURNABLE'; end if;
  insert into public.invoice_returns(shop_id, invoice_id, customer_id, idempotency_key, reason, created_by)
  values (p_shop_id, p_invoice_id, v_invoice.loyalty_customer_id, p_idempotency_key, left(coalesce(p_reason, ''), 500), v_actor)
  returning * into v_return;
  for v_item in select value from jsonb_array_elements(p_items) as items(value) loop
    select * into v_line from public.invoice_items where id = nullif(v_item->>'invoice_item_id','')::uuid and invoice_id = p_invoice_id and shop_id = p_shop_id for update;
    if not found then raise exception using errcode = 'P0002', message = 'INVOICE_ITEM_NOT_FOUND'; end if;
    v_qty := nullif(v_item->>'quantity', '')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception using errcode = '22023', message = 'INVALID_RETURN_QUANTITY'; end if;
    select coalesce(sum(iri.quantity), 0) into v_already from public.invoice_return_items iri join public.invoice_returns ir on ir.id = iri.return_id and ir.shop_id = p_shop_id where iri.invoice_item_id = v_line.id and iri.shop_id = p_shop_id and ir.status = 'completed';
    if v_qty > v_line.quantity - v_already then raise exception using errcode = '22023', message = 'RETURN_QUANTITY_EXCEEDS_REMAINING'; end if;
    v_stock_delta := round((v_line.stock_quantity_delta / v_line.quantity) * v_qty, 6);
    v_refund := round((v_line.line_total / v_line.quantity) * v_qty, 4);
    select coalesce(sum(points_delta), 0) into v_sale_points from public.loyalty_point_ledger where shop_id = p_shop_id and invoice_item_id = v_line.id and entry_type = 'invoice_earned';
    v_points := case when v_qty = v_line.quantity - v_already then v_sale_points else floor((v_sale_points * v_qty / v_line.quantity) * 100) / 100 end;
    if v_line.product_id is not null then
      update public.products set quantity = quantity + v_stock_delta, version = version + 1, updated_at = now(), updated_by = v_actor where id = v_line.product_id and shop_id = p_shop_id returning * into v_product;
      if not found then raise exception using errcode = 'P0002', message = 'RETURN_PRODUCT_NOT_FOUND'; end if;
      insert into public.stock_movements(shop_id, product_id, invoice_id, return_id, kind, quantity_delta, reason, created_by) values (p_shop_id, v_line.product_id, p_invoice_id, v_return.id, 'return', v_stock_delta, left('مرتجع من الفاتورة ' || v_invoice.invoice_number, 500), v_actor);
    end if;
    insert into public.invoice_return_items(return_id, shop_id, invoice_item_id, product_id, product_name_snapshot, quantity, stock_quantity_delta, refund_amount, points_reversed) values (v_return.id, p_shop_id, v_line.id, v_line.product_id, v_line.product_name_snapshot, v_qty, v_stock_delta, v_refund, v_points);
    if v_invoice.loyalty_customer_id is not null and v_points > 0 then
      insert into public.loyalty_point_ledger(shop_id, customer_id, invoice_id, invoice_item_id, return_id, points_delta, entry_type, description, created_by) values (p_shop_id, v_invoice.loyalty_customer_id, p_invoice_id, v_line.id, v_return.id, -v_points, 'return_reversed', 'خصم نقاط بسبب مرتجع من الفاتورة ' || v_invoice.invoice_number, v_actor);
      update public.loyalty_customers set current_points = greatest(0, current_points - v_points), updated_at = now() where id = v_invoice.loyalty_customer_id and shop_id = p_shop_id;
    end if;
    v_total := v_total + v_refund;
    v_points_total := v_points_total + v_points;
  end loop;
  select not exists (select 1 from public.invoice_items ii where ii.invoice_id = p_invoice_id and ii.shop_id = p_shop_id and ii.quantity > (select coalesce(sum(iri.quantity),0) from public.invoice_return_items iri join public.invoice_returns ir on ir.id = iri.return_id and ir.shop_id = p_shop_id where iri.invoice_item_id = ii.id and ir.status = 'completed')) into v_returned_all;
  update public.invoice_returns set refund_total = v_total, points_reversed = v_points_total where id = v_return.id;
  update public.invoices set status = case when v_returned_all then 'returned'::public.invoice_status else 'partially_returned'::public.invoice_status end where id = p_invoice_id and shop_id = p_shop_id;
  insert into public.audit_events(shop_id, actor_id, action, entity_type, entity_id, changed_fields, details) values (p_shop_id, v_actor, 'invoice.returned', 'invoice_return', v_return.id, array['refund_total','points_reversed','inventory'], jsonb_build_object('invoice_id', p_invoice_id, 'refund_total', v_total, 'points_reversed', v_points_total));
  return jsonb_build_object('return_id', v_return.id, 'invoice_id', p_invoice_id, 'refund_total', v_total, 'points_reversed', v_points_total, 'invoice_status', case when v_returned_all then 'returned' else 'partially_returned' end, 'idempotent_replay', false);
end;
$$;

revoke all on function public.apply_invoice_loyalty(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_invoice_intent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.get_invoice_returnable_items(uuid, uuid) from public, anon, authenticated;
revoke all on function public.create_invoice_return(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.complete_invoice_intent(uuid, uuid) to authenticated;
grant execute on function public.get_invoice_returnable_items(uuid, uuid) to authenticated;
grant execute on function public.create_invoice_return(uuid, uuid, uuid, jsonb, text) to authenticated;

notify pgrst, 'reload schema';
commit;
