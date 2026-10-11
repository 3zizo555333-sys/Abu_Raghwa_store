begin;

-- Trigger-function-only fix. No business rows are inserted, updated, or deleted.
-- invoices and invoice_intents do not have deleted_at; only products uses the
-- soft-delete transition check.
create or replace function public.emit_shop_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop_id uuid;
  v_entity_id uuid;
  v_operation text;
  v_version bigint;
begin
  if tg_op = 'DELETE' then
    v_shop_id := old.shop_id;
    v_entity_id := old.id;
    v_operation := 'DELETE';
    v_version := null;
  else
    v_shop_id := new.shop_id;
    v_entity_id := new.id;
    v_version := case
      when to_jsonb(new) ? 'version' then (to_jsonb(new)->>'version')::bigint
      else null
    end;

    if tg_op = 'INSERT' then
      v_operation := 'INSERT';
    elsif tg_table_name = 'products' then
      if old.deleted_at is null and new.deleted_at is not null then
        v_operation := 'DELETE';
      else
        v_operation := 'UPDATE';
      end if;
    else
      v_operation := 'UPDATE';
    end if;
  end if;

  insert into public.shop_change_events(shop_id, entity_type, entity_id, operation, version)
  values (v_shop_id, tg_table_name, v_entity_id, v_operation, v_version);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.emit_shop_change_event() from public, anon, authenticated;
grant execute on function public.emit_shop_change_event() to authenticated;

notify pgrst, 'reload schema';
commit;
