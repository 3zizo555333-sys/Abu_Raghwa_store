begin;

-- The generic change trigger used to dereference NEW.shop_id directly.  Some
-- cloud tables (including store_offers) use store_id instead, so a trigger
-- invocation failed before the offer row could be persisted.
create or replace function public.emit_shop_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_shop_id uuid;
  v_entity_id uuid;
  v_operation text;
  v_version bigint;
begin
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;

  v_shop_id := coalesce(
    nullif(coalesce(v_new, v_old)->>'store_id', '')::uuid,
    nullif(coalesce(v_new, v_old)->>'shop_id', '')::uuid
  );
  v_entity_id := nullif(coalesce(v_new, v_old)->>'id', '')::uuid;
  v_version := case
    when coalesce(v_new, v_old) ? 'version'
      and (coalesce(v_new, v_old)->>'version') ~ '^[0-9]+$'
    then (coalesce(v_new, v_old)->>'version')::bigint
    else null
  end;

  if tg_op = 'DELETE' then
    v_operation := 'DELETE';
  elsif tg_op = 'INSERT' then
    v_operation := 'INSERT';
  elsif tg_table_name = 'products'
    and (v_old->>'deleted_at') is null
    and (v_new->>'deleted_at') is not null then
    v_operation := 'DELETE';
  else
    v_operation := 'UPDATE';
  end if;

  if v_shop_id is not null and v_entity_id is not null then
    insert into public.shop_change_events(shop_id, entity_type, entity_id, operation, version)
    values (v_shop_id, tg_table_name, v_entity_id, v_operation, v_version);
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Keep the offer trigger explicit so future migrations cannot accidentally
-- attach a shop_id-specific trigger implementation to this table.
drop trigger if exists store_offers_emit_event on public.store_offers;
create trigger store_offers_emit_event
after insert or update or delete on public.store_offers
for each row execute function public.emit_shop_change_event();

notify pgrst, 'reload schema';
commit;
