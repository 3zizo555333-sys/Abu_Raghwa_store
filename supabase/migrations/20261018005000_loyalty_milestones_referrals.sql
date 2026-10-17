begin;

create table if not exists public.loyalty_milestones (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  points_required integer not null check (points_required > 0),
  reward_name text not null check (length(trim(reward_name)) between 1 and 180),
  reward_image_url text,
  is_mystery boolean not null default false,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.referral_campaign_settings (
  id uuid primary key default gen_random_uuid(),
  store_id text not null,
  title text not null default 'شارك التوفير مع حبايبك واكسب نقاط مجانية!',
  message_template text not null default 'ادعُ أصدقاءك للتسجيل في نظام ولاء أبو رغوة واكسب 50 نقطة عن كل صديق!',
  points_per_friend integer not null default 50 check (points_per_friend >= 0),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create unique index if not exists referral_campaign_settings_store_uidx on public.referral_campaign_settings(store_id);
create index if not exists loyalty_milestones_store_points_idx on public.loyalty_milestones(store_id, points_required, created_at);

alter table public.loyalty_milestones enable row level security;
alter table public.loyalty_milestones force row level security;
alter table public.referral_campaign_settings enable row level security;
alter table public.referral_campaign_settings force row level security;

revoke all on public.loyalty_milestones, public.referral_campaign_settings from public, anon;
grant select, insert, update, delete on public.loyalty_milestones, public.referral_campaign_settings to authenticated;

drop policy if exists loyalty_milestones_manager_select on public.loyalty_milestones;
drop policy if exists loyalty_milestones_manager_insert on public.loyalty_milestones;
drop policy if exists loyalty_milestones_manager_update on public.loyalty_milestones;
drop policy if exists loyalty_milestones_manager_delete on public.loyalty_milestones;
create policy loyalty_milestones_manager_select on public.loyalty_milestones for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_milestones_manager_insert on public.loyalty_milestones for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy loyalty_milestones_manager_update on public.loyalty_milestones for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy loyalty_milestones_manager_delete on public.loyalty_milestones for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

drop policy if exists referral_settings_manager_select on public.referral_campaign_settings;
drop policy if exists referral_settings_manager_insert on public.referral_campaign_settings;
drop policy if exists referral_settings_manager_update on public.referral_campaign_settings;
drop policy if exists referral_settings_manager_delete on public.referral_campaign_settings;
create policy referral_settings_manager_select on public.referral_campaign_settings for select to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy referral_settings_manager_insert on public.referral_campaign_settings for insert to authenticated
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy referral_settings_manager_update on public.referral_campaign_settings for update to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));
create policy referral_settings_manager_delete on public.referral_campaign_settings for delete to authenticated
  using (public.has_shop_role(store_id::uuid, array['manager','admin']::public.shop_role[]));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('loyalty-images', 'loyalty-images', true, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists loyalty_images_public_read on storage.objects;
drop policy if exists loyalty_images_authenticated_insert on storage.objects;
drop policy if exists loyalty_images_authenticated_update on storage.objects;
drop policy if exists loyalty_images_authenticated_delete on storage.objects;
create policy loyalty_images_public_read on storage.objects for select to public using (bucket_id = 'loyalty-images');
create policy loyalty_images_authenticated_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'loyalty-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_images_authenticated_update on storage.objects for update to authenticated
  using (bucket_id = 'loyalty-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]))
  with check (bucket_id = 'loyalty-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin','supervisor']::public.shop_role[]));
create policy loyalty_images_authenticated_delete on storage.objects for delete to authenticated
  using (bucket_id = 'loyalty-images' and public.has_shop_role(split_part(name, '/', 1)::uuid, array['manager','admin']::public.shop_role[]));

create or replace function public.get_public_loyalty_experience(p_customer_code text default null, p_phone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_store_id text;
  v_code text := upper(nullif(trim(coalesce(p_customer_code, '')), ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g');
  v_milestones jsonb;
  v_referral jsonb;
begin
  select lc.shop_id::text into v_store_id
    from public.loyalty_customers lc
   where lc.deleted_at is null
     and ((v_code <> '' and upper(lc.customer_code) = v_code)
       or (v_phone <> '' and regexp_replace(coalesce(lc.phone, ''), '[^0-9]+', '', 'g') = v_phone))
   order by lc.created_at asc limit 1;

  if v_store_id is null then
    return jsonb_build_object('milestones', '[]'::jsonb, 'referral', null);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', lm.id, 'pointsRequired', lm.points_required, 'rewardName', lm.reward_name, 'rewardImageUrl', lm.reward_image_url, 'isMystery', lm.is_mystery, 'description', lm.description) order by lm.points_required, lm.created_at), '[]'::jsonb)
    into v_milestones from public.loyalty_milestones lm where lm.store_id = v_store_id;
  select to_jsonb(rc) - 'id' - 'store_id' into v_referral from public.referral_campaign_settings rc where rc.store_id = v_store_id and rc.is_active = true limit 1;
  return jsonb_build_object('milestones', v_milestones, 'referral', v_referral);
end;
$$;
revoke all on function public.get_public_loyalty_experience(text, text) from public;
grant execute on function public.get_public_loyalty_experience(text, text) to anon, authenticated;

alter table public.loyalty_milestones replica identity full;
alter table public.referral_campaign_settings replica identity full;
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loyalty_milestones') then
      alter publication supabase_realtime add table public.loyalty_milestones;
    end if;
    if not exists (select 1 from pg_catalog.pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'referral_campaign_settings') then
      alter publication supabase_realtime add table public.referral_campaign_settings;
    end if;
  end if;
end;
$$;
commit;
