begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('shop-feature-images', 'shop-feature-images', false, 300000, array['image/webp','image/jpeg']::text[])
on conflict (id) do update set public = false, file_size_limit = 300000, allowed_mime_types = array['image/webp','image/jpeg']::text[];

create or replace function public.shop_feature_image_shop_from_path(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  if p_name !~ '^[0-9a-fA-F-]{36}/(invoice|expense|raw_material)/[A-Za-z0-9_-]{1,80}/[0-9a-fA-F-]{36}[.](webp|jpg|jpeg)$' then return null; end if;
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function public.shop_feature_image_shop_from_path(text) from public, anon;
grant execute on function public.shop_feature_image_shop_from_path(text) to authenticated;

create table public.shop_feature_images (
  id uuid primary key,
  shop_id uuid not null references public.shops(id) on delete cascade,
  feature_type text not null check (feature_type in ('invoice','expense','raw_material')),
  owner_id text not null check (owner_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  supplier_account_id uuid,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/webp','image/jpeg')),
  size_bytes integer not null check (size_bytes between 1 and 299999),
  file_name text not null check (length(file_name) between 1 and 255),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (supplier_account_id, shop_id) references public.shop_credit_accounts(id, shop_id),
  check ((feature_type = 'invoice') or supplier_account_id is null),
  check (public.shop_feature_image_shop_from_path(storage_path) = shop_id),
  check (split_part(storage_path, '/', 2) = feature_type),
  check (split_part(storage_path, '/', 3) = owner_id),
  check (split_part(storage_path, '/', 4) = id::text || case when content_type = 'image/webp' then '.webp' else '.jpg' end)
);
create index shop_feature_images_owner_idx on public.shop_feature_images(shop_id, feature_type, owner_id, created_at desc);
create index shop_feature_images_supplier_idx on public.shop_feature_images(shop_id, supplier_account_id) where supplier_account_id is not null;

alter table public.shop_feature_images enable row level security;
alter table public.shop_feature_images force row level security;
create policy shop_feature_images_role_read on public.shop_feature_images for select to authenticated
  using ((feature_type in ('invoice','raw_material') and public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
    or (feature_type = 'expense' and public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])));
create policy shop_feature_images_role_insert on public.shop_feature_images for insert to authenticated
  with check ((feature_type in ('invoice','raw_material') and public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
    or (feature_type = 'expense' and public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])));
create policy shop_feature_images_role_delete on public.shop_feature_images for delete to authenticated
  using ((feature_type in ('invoice','raw_material') and public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
    or (feature_type = 'expense' and public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[])));
grant select, insert, delete on public.shop_feature_images to authenticated;
revoke all on public.shop_feature_images from anon, public;
create trigger shop_feature_images_emit_event after insert or update or delete on public.shop_feature_images
  for each row execute function public.emit_shop_change_event();

create or replace function public.feature_image_path_is_allowed(p_name text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select case
    when public.shop_feature_image_shop_from_path(p_name) is null then false
    when split_part(p_name,'/',2) = 'expense' then public.has_shop_role(public.shop_feature_image_shop_from_path(p_name), array['manager','admin']::public.shop_role[])
    else public.has_shop_role(public.shop_feature_image_shop_from_path(p_name), array['manager','admin','supervisor']::public.shop_role[])
  end;
$$;
revoke all on function public.feature_image_path_is_allowed(text) from public, anon;
grant execute on function public.feature_image_path_is_allowed(text) to authenticated;

create policy shop_feature_images_storage_read on storage.objects for select to authenticated
  using (bucket_id = 'shop-feature-images' and public.feature_image_path_is_allowed(name));
create policy shop_feature_images_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'shop-feature-images'
    and public.feature_image_path_is_allowed(name)
    and coalesce((metadata->>'size')::bigint, 0) between 1 and 299999
    and metadata->>'mimetype' in ('image/webp','image/jpeg'));
create policy shop_feature_images_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'shop-feature-images' and public.feature_image_path_is_allowed(name));

-- Supervisors may see supplier identities for invoice association only; money movements stay manager-only.
create policy shop_credit_accounts_supervisor_supplier_read on public.shop_credit_accounts for select to authenticated
  using (party_type = 'supplier' and deleted_at is null
    and public.has_shop_role(shop_id, array['supervisor']::public.shop_role[]));

-- Enable change streams used by the UI hooks. Repeated publication membership is harmless.
do $$ begin
  alter publication supabase_realtime add table public.shop_credit_accounts;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.shop_credit_transactions;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.shop_feature_images;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
commit;
