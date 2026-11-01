begin;

alter table public.trivia_contests add column if not exists question_image_url text;
alter table public.trivia_contests add column if not exists banner_image_url text;
drop view if exists public.public_trivia_contests;
create or replace view public.public_trivia_contests with (security_barrier=true) as
  select id,shop_id,title,question,question_image_url,options,prize_title,prize_image_url,banner_image_url,ends_at,status,created_at
  from public.trivia_contests
  where status in ('active','drawing','completed');

grant select on public.public_trivia_contests to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('community-images','community-images',true,20971520,array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public=true,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists community_images_public_read on storage.objects;
drop policy if exists community_images_authenticated_insert on storage.objects;
drop policy if exists community_images_authenticated_delete on storage.objects;

create policy community_images_public_read on storage.objects
  for select to public using (bucket_id='community-images');
create policy community_images_authenticated_insert on storage.objects
  for insert to authenticated
  with check (bucket_id='community-images' and public.has_shop_role(split_part(name,'/',1)::uuid,array['manager','admin','supervisor']::public.shop_role[]));
create policy community_images_authenticated_delete on storage.objects
  for delete to authenticated
  using (bucket_id='community-images' and public.has_shop_role(split_part(name,'/',1)::uuid,array['manager','admin','supervisor']::public.shop_role[]));

commit;
