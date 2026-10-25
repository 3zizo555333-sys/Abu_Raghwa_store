begin;
do $$
declare v_shop uuid;
begin
  select id into v_shop from public.shops order by created_at asc limit 1;
  update public.catalog_companies set image_url = '/rajwa-logo.svg' where shop_id = v_shop and name = 'رَجْوَى' and deleted_at is null;
  update public.catalog_categories set image_url = '/rajwa-logo.svg' where shop_id = v_shop and name = 'تركيبات أبو رغوة' and deleted_at is null;
end $$;
notify pgrst, 'reload schema';
commit;
