create or replace function public.search_products_by_barcode(
  p_shop_id uuid,
  p_barcode text
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_is_manager boolean;
  v_items jsonb;
  v_code text := nullif(trim(p_barcode), '');
begin
  if not public.is_shop_member(p_shop_id) then
    raise exception using errcode = '42501', message = 'SHOP_ACCESS_DENIED';
  end if;
  if v_code is null or length(v_code) > 120 then
    raise exception using errcode = '22023', message = 'INVALID_BARCODE';
  end if;

  v_is_manager := public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]);
  select coalesce(
    jsonb_agg(
      case when v_is_manager then to_jsonb(p)
        else to_jsonb(p) - array['wholesale_price_per_unit','wholesale_price_per_piece','cost_per_unit','cost_per_piece','bulk_profit_percent','retail_profit_percent']
      end
      order by p.created_at desc, p.id desc
    ),
    '[]'::jsonb
  )
  into v_items
  from (
    select product.*
    from public.products as product
    where product.shop_id = p_shop_id
      and product.deleted_at is null
      and (
        product.barcode = v_code
        or product.plu = v_code
        or exists (
          select 1
          from public.product_barcodes as barcode
          where barcode.shop_id = product.shop_id
            and barcode.product_id = product.id
            and barcode.barcode = v_code
        )
      )
    order by product.created_at desc, product.id desc
    limit 20
  ) as p;

  return v_items;
end;
$$;

revoke all on function public.search_products_by_barcode(uuid, text) from public, anon;
grant execute on function public.search_products_by_barcode(uuid, text) to authenticated;
