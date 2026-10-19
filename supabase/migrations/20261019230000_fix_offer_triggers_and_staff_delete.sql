begin;

-- Make the shared change-event function schema-agnostic. Reading fields through
-- JSONB avoids PL/pgSQL record-field errors on tables with different shapes.
create or replace function public.emit_shop_change_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
  v_old jsonb;
  v_row jsonb;
  v_shop_text text;
  v_entity_text text;
  v_shop_id uuid;
  v_entity_id uuid;
  v_operation text;
  v_version bigint;
begin
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_row := coalesce(v_new, v_old);
  v_shop_text := coalesce(v_row->>'shop_id', v_row->>'store_id');
  v_entity_text := v_row->>'id';
  v_shop_id := case when v_shop_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_shop_text::uuid else null end;
  v_entity_id := case when v_entity_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then v_entity_text::uuid else null end;
  v_version := case when v_row ? 'version' and (v_row->>'version') ~ '^[0-9]+$' then (v_row->>'version')::bigint else null end;

  if tg_op = 'DELETE' then
    v_operation := 'DELETE';
  elsif tg_op = 'INSERT' then
    v_operation := 'INSERT';
  elsif (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then
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

-- Remove every user trigger currently attached to store_offers, then install
-- only triggers whose functions use the actual store_offers columns.
do $$
declare
  trigger_name text;
begin
  for trigger_name in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.store_offers'::regclass
      and not t.tgisinternal
  loop
    execute format('drop trigger if exists %I on public.store_offers', trigger_name);
  end loop;
end;
$$;

create trigger store_offers_touch_updated_at
before update on public.store_offers
for each row execute function public.touch_updated_at();

create trigger store_offers_sync_tenant_ids
before insert or update of store_id, shop_id on public.store_offers
for each row execute function public.sync_store_offer_tenant_ids();

create trigger store_offers_emit_event
after insert or update or delete on public.store_offers
for each row execute function public.emit_shop_change_event();

-- Managers, admins, and supervisors can remove staff directly from the admin
-- screen; the application still scopes the delete to the active shop.
grant delete on public.staff_employees to authenticated;
drop policy if exists staff_employees_manager_delete on public.staff_employees;
create policy staff_employees_manager_delete
on public.staff_employees
for delete to authenticated
using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

notify pgrst, 'reload schema';
commit;
