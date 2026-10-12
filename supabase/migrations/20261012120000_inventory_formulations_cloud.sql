begin;

-- Idempotency receipt for bulk warehouse writes: retrying the same request cannot duplicate rows.
create table public.apartment_inventory_bulk_requests (
  shop_id uuid not null references public.shops(id) on delete cascade,
  request_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (shop_id, request_id)
);
alter table public.apartment_inventory_bulk_requests enable row level security;
-- Only SECURITY DEFINER RPCs can access this receipt table; direct grants are revoked below.
revoke all on public.apartment_inventory_bulk_requests from public, anon, authenticated;

-- Required for the composite tenant-scoped image foreign key below.
create unique index if not exists apartment_inventory_items_id_shop_key on public.apartment_inventory_items(id, shop_id);

create table public.apartment_inventory_images (
  id uuid primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  item_id uuid not null references public.apartment_inventory_items(id) on delete cascade,
  storage_path text not null unique,
  content_type text not null check (content_type = 'image/webp'),
  size_bytes bigint not null check (size_bytes between 1 and 5242880),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, shop_id),
  foreign key (item_id, shop_id) references public.apartment_inventory_items(id, shop_id) on delete cascade
);
alter table public.apartment_inventory_images enable row level security;
alter table public.apartment_inventory_images force row level security;
create policy apartment_inventory_images_member_read on public.apartment_inventory_images for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_images_manager_insert on public.apartment_inventory_images for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_images_manager_delete on public.apartment_inventory_images for delete to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
revoke all on public.apartment_inventory_images from public, anon, authenticated;
grant select, delete on public.apartment_inventory_images to authenticated;

create or replace function public.apartment_inventory_shop_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/apartment-inventory/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}[.]webp$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function public.apartment_inventory_shop_from_path(text) from public, anon;
grant execute on function public.apartment_inventory_shop_from_path(text) to authenticated;

create policy apartment_inventory_image_member_read on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and public.has_shop_role(public.apartment_inventory_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[]));
create policy apartment_inventory_image_manager_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and public.has_shop_role(public.apartment_inventory_shop_from_path(name), array['manager','admin','supervisor']::public.shop_role[])
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 5242880
    and metadata->>'mimetype' = 'image/webp'
  );
create policy apartment_inventory_image_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.has_shop_role(public.apartment_inventory_shop_from_path(name), array['manager','admin']::public.shop_role[]));

create or replace function public.create_apartment_inventory_items_bulk(
  p_shop_id uuid, p_request_id uuid, p_items jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_result jsonb;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501', message='APARTMENT_INVENTORY_FORBIDDEN'; end if;
  if p_request_id is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 5000 then raise exception using errcode='22023', message='INVALID_APARTMENT_INVENTORY_BATCH'; end if;
  v_hash := md5(p_items::text);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_shop_id::text || ':' || p_request_id::text, 0));
  select result into v_result from public.apartment_inventory_bulk_requests where shop_id=p_shop_id and request_id=p_request_id;
  if found then
    if (select payload_hash from public.apartment_inventory_bulk_requests where shop_id=p_shop_id and request_id=p_request_id) <> v_hash then raise exception using errcode='23505', message='BULK_REQUEST_ID_REUSED'; end if;
    return v_result;
  end if;
  with input_rows as (
    select x.* from jsonb_to_recordset(p_items) as x(
      name text, supplier text, location text, unit text, pieces_per_unit numeric, quantity numeric,
      extra_pieces numeric, wholesale_price numeric, retail_price numeric, wholesale_retail_price numeric, category_name text
    )
  ), inserted as (
    insert into public.apartment_inventory_items(shop_id,name,supplier,location,unit,pieces_per_unit,quantity,extra_pieces,wholesale_price,retail_price,wholesale_retail_price,category_name)
    select p_shop_id, btrim(name), coalesce(supplier,''), coalesce(location,''), coalesce(unit,''), coalesce(pieces_per_unit,0), coalesce(quantity,0), coalesce(extra_pieces,0), coalesce(wholesale_price,0), coalesce(retail_price,0), coalesce(wholesale_retail_price,0), btrim(category_name)
    from input_rows
    returning *
  ) select coalesce(jsonb_agg(to_jsonb(inserted) order by created_at,id), '[]'::jsonb) into v_result from inserted;
  insert into public.apartment_inventory_bulk_requests(shop_id,request_id,payload_hash,result) values(p_shop_id,p_request_id,v_hash,v_result);
  return v_result;
end;
$$;
revoke all on function public.create_apartment_inventory_items_bulk(uuid,uuid,jsonb) from public, anon;
grant execute on function public.create_apartment_inventory_items_bulk(uuid,uuid,jsonb) to authenticated;

create or replace function public.move_apartment_inventory_items_category(
  p_shop_id uuid, p_expected_items jsonb, p_category text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_expected_count integer; v_locked_count integer; v_updated jsonb;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501', message='APARTMENT_INVENTORY_FORBIDDEN'; end if;
  if jsonb_typeof(p_expected_items) <> 'array' or jsonb_array_length(p_expected_items)=0 or length(btrim(p_category)) not between 1 and 120 then raise exception using errcode='22023', message='INVALID_CATEGORY_MOVE'; end if;
  select count(*), count(distinct (x->>'id')::uuid) into v_expected_count,v_locked_count from jsonb_array_elements(p_expected_items) x;
  if v_expected_count <> v_locked_count then raise exception using errcode='22023', message='DUPLICATE_ITEM_IDS'; end if;
  perform i.id from public.apartment_inventory_items i join jsonb_to_recordset(p_expected_items) as e(id uuid,updated_at timestamptz) on e.id=i.id
    where i.shop_id=p_shop_id order by i.id for update;
  select count(*) into v_locked_count from public.apartment_inventory_items i join jsonb_to_recordset(p_expected_items) as e(id uuid,updated_at timestamptz) on e.id=i.id
    where i.shop_id=p_shop_id and i.updated_at=e.updated_at;
  if v_locked_count <> v_expected_count then raise exception using errcode='40001', message='APARTMENT_INVENTORY_VERSION_CONFLICT'; end if;
  with expected as (select * from jsonb_to_recordset(p_expected_items) as e(id uuid,updated_at timestamptz)), updated as (
    update public.apartment_inventory_items i set category_name=btrim(p_category)
    from expected e where i.id=e.id and i.shop_id=p_shop_id and i.updated_at=e.updated_at returning i.*
  ) select coalesce(jsonb_agg(to_jsonb(updated) order by id),'[]'::jsonb) into v_updated from updated;
  if jsonb_array_length(v_updated) <> v_expected_count then raise exception using errcode='40001', message='APARTMENT_INVENTORY_VERSION_CONFLICT'; end if;
  return v_updated;
end;
$$;
revoke all on function public.move_apartment_inventory_items_category(uuid,jsonb,text) from public, anon;
grant execute on function public.move_apartment_inventory_items_category(uuid,jsonb,text) to authenticated;

create or replace function public.register_apartment_inventory_image(
  p_shop_id uuid,p_item_id uuid,p_image_id uuid,p_storage_path text,p_content_type text,p_size_bytes bigint
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_meta jsonb; v_size bigint; v_type text;
begin
  if not public.has_shop_role(p_shop_id,array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501',message='IMAGE_UPLOAD_FORBIDDEN'; end if;
  if p_content_type <> 'image/webp' or p_size_bytes < 1 or p_size_bytes > 5242880 then raise exception using errcode='22023',message='INVALID_APARTMENT_INVENTORY_IMAGE'; end if;
  if public.apartment_inventory_shop_from_path(p_storage_path) is distinct from p_shop_id
    or split_part(p_storage_path,'/',3)::uuid is distinct from p_item_id
    or split_part(split_part(p_storage_path,'/',4),'.',1)::uuid is distinct from p_image_id then raise exception using errcode='22023',message='INVALID_APARTMENT_INVENTORY_IMAGE_PATH'; end if;
  if not exists(select 1 from public.apartment_inventory_items where id=p_item_id and shop_id=p_shop_id) then raise exception using errcode='P0002',message='APARTMENT_INVENTORY_ITEM_NOT_FOUND'; end if;
  select metadata into v_meta from storage.objects where bucket_id='product-images' and name=p_storage_path;
  if not found then raise exception using errcode='P0002',message='STORAGE_OBJECT_NOT_FOUND'; end if;
  v_size:=nullif(v_meta->>'size','')::bigint; v_type:=v_meta->>'mimetype';
  if v_size is distinct from p_size_bytes or v_type is distinct from p_content_type then raise exception using errcode='22023',message='STORAGE_METADATA_MISMATCH'; end if;
  insert into public.apartment_inventory_images(id,shop_id,item_id,storage_path,content_type,size_bytes,created_by)
  values(p_image_id,p_shop_id,p_item_id,p_storage_path,p_content_type,p_size_bytes,(select auth.uid()));
  return p_image_id;
end;
$$;
revoke all on function public.register_apartment_inventory_image(uuid,uuid,uuid,text,text,bigint) from public, anon;
grant execute on function public.register_apartment_inventory_image(uuid,uuid,uuid,text,text,bigint) to authenticated;

-- Extend the existing formulation domain rather than fork the recipes used by catalog/sales.
alter table public.recipes add column if not exists production_quantity numeric(18,6) not null default 1 check (production_quantity > 0);
alter table public.recipes add column if not exists production_unit text not null default 'قطعة';
alter table public.recipes add column if not exists notes text not null default '';
alter table public.recipes add column if not exists loyalty_points integer not null default 0 check (loyalty_points >= 0);
alter table public.recipes add column if not exists image_url text;
alter table public.recipes add column if not exists is_password_protected boolean not null default false;
alter table public.recipes add column if not exists password_hash text;
alter table public.recipe_ingredients add column if not exists raw_material_id uuid;
alter table public.recipe_ingredients add column if not exists material_name_snapshot text not null default '';
alter table public.recipe_ingredients add constraint recipe_ingredients_raw_material_shop_fk foreign key(raw_material_id,shop_id) references public.raw_materials(id,shop_id) on delete restrict;
create index if not exists recipe_ingredients_raw_material_idx on public.recipe_ingredients(shop_id,raw_material_id);
create policy recipe_ingredients_manager_delete on public.recipe_ingredients for delete to authenticated
  using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));
create or replace view public.formulations with (security_invoker=true) as
  select id,shop_id,name,description,cost_price,retail_price,category,version,production_quantity,production_unit,notes,loyalty_points,image_url,is_password_protected,password_hash,created_at,updated_at,deleted_at from public.recipes;
grant select,insert,update on public.formulations to authenticated;

create or replace function public.save_formulation_with_ingredients(
  p_shop_id uuid,p_formulation_id uuid,p_expected_version bigint,p_formulation jsonb,p_ingredients jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.recipes; v_out jsonb; v_count integer;
begin
  if not public.has_shop_role(p_shop_id,array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501',message='FORMULATION_FORBIDDEN'; end if;
  if jsonb_typeof(p_ingredients)<>'array' or length(btrim(coalesce(p_formulation->>'name',''))) not between 1 and 180 then raise exception using errcode='22023',message='INVALID_FORMULATION'; end if;
  if p_formulation_id is null then
    insert into public.recipes(shop_id,name,description,cost_price,retail_price,category,production_quantity,production_unit,notes,loyalty_points,image_url,is_password_protected,password_hash)
    values(p_shop_id,btrim(p_formulation->>'name'),coalesce(p_formulation->>'description',''),coalesce((p_formulation->>'cost_price')::numeric,0),coalesce((p_formulation->>'retail_price')::numeric,0),coalesce(nullif(btrim(p_formulation->>'category'),''),'عام'),coalesce((p_formulation->>'production_quantity')::numeric,1),coalesce(nullif(p_formulation->>'production_unit',''),'قطعة'),coalesce(p_formulation->>'notes',''),coalesce((p_formulation->>'loyalty_points')::integer,0),nullif(p_formulation->>'image_url',''),coalesce((p_formulation->>'is_password_protected')::boolean,false),nullif(p_formulation->>'password_hash','')) returning * into v_row;
  else
    update public.recipes set name=btrim(p_formulation->>'name'),description=coalesce(p_formulation->>'description',''),cost_price=coalesce((p_formulation->>'cost_price')::numeric,0),retail_price=coalesce((p_formulation->>'retail_price')::numeric,0),category=coalesce(nullif(btrim(p_formulation->>'category'),''),'عام'),production_quantity=coalesce((p_formulation->>'production_quantity')::numeric,1),production_unit=coalesce(nullif(p_formulation->>'production_unit',''),'قطعة'),notes=coalesce(p_formulation->>'notes',''),loyalty_points=coalesce((p_formulation->>'loyalty_points')::integer,0),image_url=nullif(p_formulation->>'image_url',''),is_password_protected=coalesce((p_formulation->>'is_password_protected')::boolean,false),password_hash=case when coalesce((p_formulation->>'is_password_protected')::boolean,false) then coalesce(nullif(p_formulation->>'password_hash',''),password_hash) else null end,version=version+1,updated_at=now()
    where id=p_formulation_id and shop_id=p_shop_id and deleted_at is null and version=p_expected_version returning * into v_row;
    if not found then raise exception using errcode='40001',message='FORMULATION_VERSION_CONFLICT'; end if;
    delete from public.recipe_ingredients where recipe_id=p_formulation_id and shop_id=p_shop_id;
  end if;
  insert into public.recipe_ingredients(recipe_id,shop_id,raw_material_id,material_name_snapshot,product_id,unit,quantity,cost)
    select v_row.id,p_shop_id,x.raw_material_id,x.material_name,nullif(x.product_id::text,'')::uuid,x.unit,x.quantity,x.cost
    from jsonb_to_recordset(p_ingredients) as x(raw_material_id uuid,material_name text,product_id uuid,unit text,quantity numeric,cost numeric);
  select count(*) into v_count from public.recipe_ingredients where recipe_id=v_row.id and shop_id=p_shop_id;
  if v_count <> jsonb_array_length(p_ingredients) then raise exception using errcode='22023',message='FORMULATION_INGREDIENTS_INCOMPLETE'; end if;
  select jsonb_build_object('formulation',to_jsonb(v_row),'ingredients',coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb)) into v_out from public.recipe_ingredients i where i.recipe_id=v_row.id and i.shop_id=p_shop_id;
  if v_out is null then v_out:=jsonb_build_object('formulation',to_jsonb(v_row),'ingredients','[]'::jsonb); end if;
  return v_out;
end;
$$;
revoke all on function public.save_formulation_with_ingredients(uuid,uuid,bigint,jsonb,jsonb) from public,anon;
grant execute on function public.save_formulation_with_ingredients(uuid,uuid,bigint,jsonb,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
