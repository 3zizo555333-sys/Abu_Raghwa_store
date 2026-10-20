begin;

alter table public.store_offers
  add column if not exists is_active boolean not null default true,
  add column if not exists qr_code_data text;

update public.store_offers
set is_active = (status = 'active')
where is_active is distinct from (status = 'active');

create or replace function public.sync_store_offer_active_flag()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_active := (new.status = 'active');
  return new;
end;
$$;

drop trigger if exists store_offers_sync_active_flag on public.store_offers;
create trigger store_offers_sync_active_flag
before insert or update of status on public.store_offers
for each row execute function public.sync_store_offer_active_flag();

create index if not exists store_offers_active_created_idx
  on public.store_offers(store_id, is_active, created_at desc)
  where deleted_at is null;

notify pgrst, 'reload schema';
commit;
