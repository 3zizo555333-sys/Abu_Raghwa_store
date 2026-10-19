begin;

-- The event stream is best-effort metadata; a missing tenant id must never
-- abort the business write that produced the event.
alter table public.shop_change_events
  alter column shop_id drop not null;

-- Keep both tenant naming conventions available to the offer client and to
-- legacy triggers. store_id remains the canonical RLS/query key.
alter table public.store_offers
  add column if not exists shop_id uuid references public.shops(id) on delete cascade;

update public.store_offers
set shop_id = store_id
where shop_id is null;

alter table public.store_offers
  alter column shop_id set not null;

create or replace function public.sync_store_offer_tenant_ids()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.store_id is null and new.shop_id is null then
    raise exception 'store_offers requires store_id or shop_id';
  end if;
  if new.store_id is null then
    new.store_id := new.shop_id;
  elsif new.shop_id is null then
    new.shop_id := new.store_id;
  elsif new.store_id <> new.shop_id then
    raise exception 'store_offers store_id and shop_id must match';
  end if;
  return new;
end;
$$;

drop trigger if exists store_offers_sync_tenant_ids on public.store_offers;
create trigger store_offers_sync_tenant_ids
before insert or update of store_id, shop_id on public.store_offers
for each row execute function public.sync_store_offer_tenant_ids();

create or replace function public.emit_store_offer_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_shop_id uuid;
  v_entity_id uuid;
  v_operation text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_shop_id := nullif(coalesce(v_row->>'shop_id', v_row->>'store_id'), '')::uuid;
  v_entity_id := case
    when coalesce(v_row->>'id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then (v_row->>'id')::uuid
    else null
  end;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;

  if v_shop_id is not null and v_entity_id is not null then
    insert into public.shop_change_events(shop_id, entity_type, entity_id, operation, version)
    values (v_shop_id, tg_table_name, v_entity_id, v_operation, null);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists store_offers_emit_event on public.store_offers;
create trigger store_offers_emit_event
after insert or update or delete on public.store_offers
for each row execute function public.emit_store_offer_change_event();

revoke all on function public.sync_store_offer_tenant_ids() from public, anon, authenticated;
revoke all on function public.emit_store_offer_change_event() from public, anon;
grant execute on function public.emit_store_offer_change_event() to authenticated;
notify pgrst, 'reload schema';
commit;
