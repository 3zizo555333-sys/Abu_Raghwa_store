begin;
alter table public.store_offers add column if not exists banner_title text not null default '' check (length(banner_title) <= 240);
commit;
