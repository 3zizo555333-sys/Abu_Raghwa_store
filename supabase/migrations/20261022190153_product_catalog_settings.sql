begin;

-- Registered products need catalog-specific fields independent from POS pricing,
-- stock, and the existing product-image path. All changes remain versioned.
alter table public.products
  add column if not exists catalog_visible boolean not null default false,
  add column if not exists catalog_price numeric(18,4) check (catalog_price is null or catalog_price >= 0),
  add column if not exists catalog_old_price numeric(18,4) check (catalog_old_price is null or catalog_old_price >= 0),
  add column if not exists catalog_description text not null default '',
  add column if not exists catalog_details_url text not null default '',
  add column if not exists catalog_category text not null default '',
  add column if not exists catalog_company text not null default '',
  add column if not exists catalog_loyalty_points integer not null default 0 check (catalog_loyalty_points >= 0);

create or replace function public.update_product_catalog_settings(
  p_shop_id uuid,
  p_product_id uuid,
  p_expected_version bigint,
  p_payload jsonb
) returns public.products
language plpgsql security definer set search_path = '' as $$
declare
  v_product public.products;
  v_price numeric(18,4);
  v_old_price numeric(18,4);
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'PRODUCT_CATALOG_WRITE_FORBIDDEN';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_PRODUCT_CATALOG_SETTINGS';
  end if;
  if p_payload ? 'catalog_price' and nullif(p_payload->>'catalog_price', '') is not null then
    v_price := (p_payload->>'catalog_price')::numeric;
    if v_price < 0 then raise exception using errcode = '22023', message = 'INVALID_CATALOG_PRICE'; end if;
  end if;
  if p_payload ? 'catalog_old_price' and nullif(p_payload->>'catalog_old_price', '') is not null then
    v_old_price := (p_payload->>'catalog_old_price')::numeric;
    if v_old_price < 0 then raise exception using errcode = '22023', message = 'INVALID_CATALOG_OLD_PRICE'; end if;
  end if;
  select * into v_product from public.products
    where id = p_product_id and shop_id = p_shop_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'PRODUCT_NOT_FOUND'; end if;
  if v_product.version <> p_expected_version then
    raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT';
  end if;

  update public.products set
    catalog_visible = case when p_payload ? 'catalog_visible' then (p_payload->>'catalog_visible')::boolean else catalog_visible end,
    catalog_price = case when p_payload ? 'catalog_price' then nullif(p_payload->>'catalog_price', '')::numeric else catalog_price end,
    catalog_old_price = case when p_payload ? 'catalog_old_price' then nullif(p_payload->>'catalog_old_price', '')::numeric else catalog_old_price end,
    catalog_description = case when p_payload ? 'catalog_description' then left(coalesce(p_payload->>'catalog_description', ''), 4000) else catalog_description end,
    catalog_details_url = case when p_payload ? 'catalog_details_url' then left(coalesce(p_payload->>'catalog_details_url', ''), 2048) else catalog_details_url end,
    catalog_category = case when p_payload ? 'catalog_category' then left(coalesce(p_payload->>'catalog_category', ''), 120) else catalog_category end,
    catalog_company = case when p_payload ? 'catalog_company' then left(coalesce(p_payload->>'catalog_company', ''), 180) else catalog_company end,
    catalog_loyalty_points = case when p_payload ? 'catalog_loyalty_points' then greatest(0, (p_payload->>'catalog_loyalty_points')::integer) else catalog_loyalty_points end,
    version = version + 1,
    updated_by = (select auth.uid()),
    updated_at = now()
  where id = p_product_id and shop_id = p_shop_id and version = p_expected_version
  returning * into v_product;
  if not found then raise exception using errcode = '40001', message = 'PRODUCT_VERSION_CONFLICT'; end if;
  return v_product;
end;
$$;

revoke all on function public.update_product_catalog_settings(uuid, uuid, bigint, jsonb) from public, anon;
grant execute on function public.update_product_catalog_settings(uuid, uuid, bigint, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
