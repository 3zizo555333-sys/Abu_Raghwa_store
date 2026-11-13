begin;

-- Keep the legacy category_id FK intact for historic supplier_invoice_categories,
-- and store invoice_categories IDs in their own correctly constrained column.
alter table public.supplier_invoices
  add column if not exists invoice_category_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.supplier_invoices'::regclass
      and conname = 'supplier_invoices_invoice_category_id_fkey'
  ) then
    alter table public.supplier_invoices
      add constraint supplier_invoices_invoice_category_id_fkey
      foreign key (invoice_category_id) references public.invoice_categories(id) on delete set null;
  end if;
end;
$$;

create index if not exists supplier_invoices_store_invoice_category_idx
  on public.supplier_invoices(store_id, invoice_category_id);

-- Backfill exact-name legacy categories only; keep unrecognized historical IDs untouched.
update public.supplier_invoices si
set invoice_category_id = ic.id
from public.supplier_invoice_categories legacy
join public.invoice_categories ic
  on ic.store_id::text = legacy.store_id and ic.name = legacy.name
where si.category_id = legacy.id and si.store_id = legacy.store_id
  and si.invoice_category_id is null;

create or replace function public.save_supplier_invoice_v1(
  p_store_id uuid,
  p_category_id uuid,
  p_supplier_name text,
  p_invoice_date date,
  p_image_url text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_item jsonb;
  v_item_name text;
  v_barcode text;
  v_quantity numeric(14,3);
  v_unit_cost numeric(14,4);
  v_total_cost numeric(14,2);
  v_previous_cost numeric(14,4);
  v_price_diff numeric(14,4);
  v_price_direction text;
  v_total_amount numeric(14,2) := 0;
  v_items jsonb;
  v_invoice_category_id uuid := null;
  v_legacy_category_id uuid := null;
begin
  if p_store_id is null or not public.has_shop_role(p_store_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'لا تملك صلاحية حفظ فواتير الموردين لهذا المتجر';
  end if;
  if p_supplier_name is null or length(trim(p_supplier_name)) not between 1 and 180 then
    raise exception using errcode = '22023', message = 'اسم المورد مطلوب ويجب ألا يتجاوز 180 حرفاً';
  end if;
  if length(coalesce(p_image_url, '')) > 4096 then
    raise exception using errcode = '22023', message = 'رابط صورة الفاتورة غير صالح';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 300 then
    raise exception using errcode = '22023', message = 'يجب أن تحتوي الفاتورة على 1 إلى 300 بند';
  end if;

  if p_category_id is not null then
    select c.id into v_invoice_category_id
      from public.invoice_categories c where c.id = p_category_id and c.store_id = p_store_id;
    if v_invoice_category_id is null then
      select c.id into v_legacy_category_id
        from public.supplier_invoice_categories c where c.id = p_category_id and c.store_id = p_store_id::text;
    end if;
    if v_invoice_category_id is null and v_legacy_category_id is null then
      raise exception using errcode = '22023', message = 'فئة الفاتورة لا تتبع المتجر النشط';
    end if;
  end if;

  insert into public.supplier_invoices (
    store_id, category_id, invoice_category_id, supplier_name, invoice_date, image_url, total_amount, notes
  ) values (
    p_store_id::text, v_legacy_category_id, v_invoice_category_id, trim(p_supplier_name),
    coalesce(p_invoice_date, current_date), coalesce(trim(p_image_url), ''), 0, coalesce(left(p_notes, 4000), '')
  ) returning * into v_invoice;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_item_name := trim(coalesce(v_item ->> 'item_name', ''));
    if length(v_item_name) not between 1 and 180 then
      raise exception using errcode = '22023', message = 'اسم أحد البنود فارغ أو يتجاوز 180 حرفاً';
    end if;
    v_quantity := coalesce(nullif(v_item ->> 'quantity', '')::numeric, 0);
    v_unit_cost := coalesce(nullif(v_item ->> 'unit_cost', '')::numeric, 0);
    if v_quantity <= 0 or v_unit_cost < 0 then
      raise exception using errcode = '22023', message = 'كمية أو سعر أحد البنود غير صالح';
    end if;
    v_barcode := nullif(left(trim(coalesce(v_item ->> 'barcode', '')), 120), '');
    v_previous_cost := nullif(v_item ->> 'previous_cost', '')::numeric;
    v_total_cost := coalesce(nullif(v_item ->> 'total_cost', '')::numeric, round(v_quantity * v_unit_cost, 2));
    if v_total_cost < 0 then
      raise exception using errcode = '22023', message = 'إجمالي أحد البنود غير صالح';
    end if;
    v_price_diff := case when v_previous_cost is null then null else round(v_unit_cost - v_previous_cost, 4) end;
    v_price_direction := case when v_price_diff is null or abs(v_price_diff) < 0.0001 then 'stable' when v_price_diff > 0 then 'up' else 'down' end;
    insert into public.supplier_invoice_items (
      invoice_id, item_name, barcode, quantity, unit_cost, total_cost, previous_cost, price_diff, price_direction
    ) values (
      v_invoice.id, v_item_name, v_barcode, v_quantity, v_unit_cost, v_total_cost, v_previous_cost, v_price_diff, v_price_direction
    );
    v_total_amount := v_total_amount + v_total_cost;
  end loop;

  update public.supplier_invoices set total_amount = round(v_total_amount, 2)
    where id = v_invoice.id returning * into v_invoice;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at, i.id), '[]'::jsonb)
    into v_items from public.supplier_invoice_items i where i.invoice_id = v_invoice.id;
  return jsonb_build_object('invoice', to_jsonb(v_invoice), 'items', v_items);
end;
$$;

revoke all on function public.save_supplier_invoice_v1(uuid, uuid, text, date, text, text, jsonb) from public, anon;
grant execute on function public.save_supplier_invoice_v1(uuid, uuid, text, date, text, text, jsonb) to authenticated;

commit;
