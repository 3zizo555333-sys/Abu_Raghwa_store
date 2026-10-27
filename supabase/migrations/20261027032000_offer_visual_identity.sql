begin;

-- SmartOffers persists to store_offers; keep the legacy offers table compatible too.
alter table public.store_offers
  add column if not exists promo_text text not null default '' check (length(promo_text) <= 240),
  add column if not exists image_url text,
  add column if not exists bg_color text not null default '#ea580c' check (length(bg_color) <= 120),
  add column if not exists banner_custom_image text;

alter table public.offers
  add column if not exists promo_text text not null default '' check (length(promo_text) <= 240),
  add column if not exists image_url text,
  add column if not exists bg_color text not null default '#ea580c' check (length(bg_color) <= 120),
  add column if not exists banner_custom_image text;

comment on column public.store_offers.image_url is 'Public URL in the public catalog-images bucket for the offer banner.';
comment on column public.store_offers.banner_custom_image is 'Optional complete custom banner image URL.';

commit;
