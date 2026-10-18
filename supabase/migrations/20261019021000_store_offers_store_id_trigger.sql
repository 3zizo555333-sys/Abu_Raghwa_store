begin;

-- store_offers uses store_id. Keep its event trigger explicit so legacy
-- generic trigger implementations cannot dereference a missing column.
create or replace function public.emit_store_offer_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_operation text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_operation := case when tg_op = 'DELETE' then 'DELETE' when tg_op = 'INSERT' then 'INSERT' else 'UPDATE' end;
  insert into public.shop_change_events(shop_id, entity_type, entity_id, operation, version)
  values ((v_row->>'store_id')::uuid, tg_table_name, md5(coalesce(v_row->>'id', ''))::uuid, v_operation, null);
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists store_offers_emit_event on public.store_offers;
create trigger store_offers_emit_event
after insert or update or delete on public.store_offers
for each row execute function public.emit_store_offer_change_event();

revoke all on function public.emit_store_offer_change_event() from public, anon;
grant execute on function public.emit_store_offer_change_event() to authenticated;
notify pgrst, 'reload schema';
commit;
