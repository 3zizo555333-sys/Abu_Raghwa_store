begin;

create or replace function public.replace_shortage_manual_products(p_shop_id uuid, p_category text, p_names text[])
returns setof public.shortage_manual_products
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_name text;
  v_category text := btrim(coalesce(p_category, ''));
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception 'insufficient_privilege' using errcode = '42501';
  end if;
  if length(v_category) not between 1 and 80 then
    raise exception 'invalid_category' using errcode = '22023';
  end if;
  if coalesce(cardinality(p_names), 0) > 500 then
    raise exception 'too_many_manual_products' using errcode = '22023';
  end if;
  update public.shortage_manual_products
  set deleted_at = now(), version = version + 1
  where shop_id = p_shop_id and lower(category_name) = lower(v_category) and deleted_at is null;
  for v_name in
    select distinct btrim(value)
    from unnest(coalesce(p_names, array[]::text[])) as names(value)
    where length(btrim(value)) between 1 and 120
    order by 1
  loop
    insert into public.shortage_manual_products(shop_id, category_name, name)
    values (p_shop_id, v_category, v_name);
  end loop;
  return query
    select * from public.shortage_manual_products
    where shop_id = p_shop_id and lower(category_name) = lower(v_category) and deleted_at is null
    order by name;
end;
$$;

revoke all on function public.replace_shortage_manual_products(uuid, text, text[]) from public, anon;
grant execute on function public.replace_shortage_manual_products(uuid, text, text[]) to authenticated;

commit;
