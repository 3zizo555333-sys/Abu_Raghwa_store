begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  exists (select 1 from storage.buckets where id='formulas' and name='formulas' and public),
  'formula images use a dedicated public bucket'
);
select ok(
  exists (select 1 from storage.buckets where id='formulas' and file_size_limit=299999 and allowed_mime_types @> array['image/webp','image/jpeg']),
  'the bucket limits images to WebP/JPEG below 300 KB'
);
select ok(exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='Allow public/auth upload' and cmd='INSERT'
    and roles::text ilike '%public%' and with_check ilike '%bucket_id%formulas%'
), 'public and authenticated uploads are limited to compressed formula images'
);
select ok(exists (
  select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='Allow public read' and cmd='SELECT'
    and roles::text ilike '%public%' and qual ilike '%bucket_id%formulas%'
), 'formula image reads are public only for the formulas bucket'
);
select ok(exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='Allow public/auth update' and cmd='UPDATE'
    and roles::text ilike '%public%' and qual ilike '%bucket_id%formulas%'
    and with_check ilike '%bucket_id%formulas%'
), 'formula image updates remain restricted to compressed files in formulas'
);
select ok(exists (
  select 1 from pg_policies where schemaname='storage' and tablename='objects'
    and policyname='formulas_image_manager_delete' and cmd='DELETE'
    and roles::text ilike '%authenticated%' and qual ilike '%has_shop_role%'
), 'only authorized shop staff can delete formula images'
);
select ok(
  (select prosecdef and coalesce(proconfig @> array['search_path=""']::text[], false)
   from pg_proc where oid='public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure),
  'the public image registration RPC is search-path-safe and privileged'
);
select ok(
  has_function_privilege('authenticated','public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)','EXECUTE')
    and not has_function_privilege('anon','public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)','EXECUTE'),
  'only authenticated shop staff can link images to formula rows'
);
select ok(
  position('public.has_shop_role' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0
    and position('storage.objects' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0
    and position('image_url = p_public_url' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0,
  'registration verifies role and uploaded object, then writes publicUrl into recipes.image_url'
);
select ok(
  position('p_size_bytes >= 300000' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0
    and position('image/webp' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0
    and position('image/jpeg' in pg_get_functiondef('public.register_public_formulation_image(uuid,uuid,bigint,uuid,text,text,text,bigint)'::regprocedure)) > 0,
  'registration rejects uncompressed or unsupported image files'
);

select * from finish();
rollback;
