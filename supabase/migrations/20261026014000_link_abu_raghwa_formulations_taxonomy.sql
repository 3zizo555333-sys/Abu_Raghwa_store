begin;
do $$
declare v_shop uuid;
begin
  select id into v_shop from public.shops order by created_at asc limit 1;
  insert into public.catalog_companies (shop_id, name)
  select v_shop, 'أبو رغوة'
  where not exists (select 1 from public.catalog_companies c where c.shop_id = v_shop and lower(c.name) = lower('أبو رغوة') and c.deleted_at is null);
  update public.recipes
  set catalog_category = 'تركيبات أبو رغوة', catalog_company = 'رَجْوَى'
  where shop_id = v_shop and deleted_at is null
    and (coalesce(nullif(trim(catalog_category), ''), 'تركيبات') in ('تركيبات','عام')
      or coalesce(nullif(trim(catalog_company), ''), 'أبو رغوة') = 'أبو رغوة');
end $$;
notify pgrst, 'reload schema';
commit;
