begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select is(
  pg_get_function_result('public.list_shop_members(uuid)'::regprocedure),
  'TABLE(user_id uuid, email text, display_name text, role shop_role, status membership_status, created_at timestamp with time zone, updated_at timestamp with time zone, last_sign_in_at timestamp with time zone)',
  'membership RPC result types match the declared contract'
);
select ok(
  position('u.email::text' in pg_get_functiondef('public.list_shop_members(uuid)'::regprocedure)) > 0
    and position('p.display_name::text' in pg_get_functiondef('public.list_shop_members(uuid)'::regprocedure)) > 0,
  'membership RPC explicitly casts profile/auth text outputs'
);
select ok(
  coalesce((select proconfig @> array['search_path=""']::text[] from pg_proc where oid='public.list_shop_members(uuid)'::regprocedure), false),
  'membership RPC retains an empty search_path'
);
select ok(
  has_function_privilege('authenticated','public.list_shop_members(uuid)','EXECUTE')
    and not has_function_privilege('anon','public.list_shop_members(uuid)','EXECUTE'),
  'membership listing remains authenticated-only'
);
select ok(exists (
  select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='formulation_image_manager_insert' and cmd='INSERT'
    and with_check ilike '%formulation_image_shop_from_path%'
    and with_check ilike '%has_shop_role%'
    and with_check ilike '%image/webp%'
    and with_check ilike '%image/jpeg%'
), 'formulation image inserts remain private, WebP/JPEG-limited, and shop-manager scoped'
);
select ok(exists (
  select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='formulation_image_manager_update' and cmd='UPDATE'
    and qual ilike '%formulation_image_shop_from_path%'
    and qual ilike '%has_shop_role%'
    and with_check ilike '%formulation_image_shop_from_path%'
    and with_check ilike '%has_shop_role%'
    and with_check ilike '%image/webp%'
    and with_check ilike '%image/jpeg%'
), 'formulation image updates are limited to the current shop manager roles'
);
select ok((select not public from storage.buckets where id='product-images'), 'product-images remains a private bucket');
select ok(
  (select prosecdef and coalesce(proconfig @> array['search_path=""']::text[], false)
   from pg_proc where oid='public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint)'::regprocedure),
  'image-linking remains a search-path-safe SECURITY DEFINER RPC'
);
select ok(
  position('public.has_shop_role' in pg_get_functiondef('public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint)'::regprocedure)) > 0,
  'image-linking RPC checks manager role before updating the formulation'
);
select ok(
  position('image/webp' in pg_get_functiondef('public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint)'::regprocedure)) > 0
    and position('image/jpeg' in pg_get_functiondef('public.register_formulation_image(uuid,uuid,bigint,uuid,text,text,bigint)'::regprocedure)) > 0,
  'image-linking RPC only accepts the two compressed output formats'
);
select ok(
  position('(webp|jpg|jpeg)' in pg_get_functiondef('public.formulation_image_shop_from_path(text)'::regprocedure)) > 0,
  'private formulation-image paths accept only the compressed file extensions'
);

select * from finish();
rollback;
