-- Cloud-native expense CRUD and financial summary. Never import browser snapshots.
begin;

alter table public.expenses
  add column if not exists expense_type text not null default 'daily'
    check (expense_type in ('daily', 'monthly')),
  add column if not exists notes text not null default '',
  add column if not exists version integer not null default 1 check (version > 0);

create or replace function public.save_expense(
  p_shop_id uuid,
  p_expense_id uuid,
  p_expected_version integer,
  p_payload jsonb
) returns public.expenses
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_expense public.expenses;
  v_description text;
  v_category text;
  v_notes text;
  v_type text;
  v_amount numeric;
  v_occurred_at timestamptz;
begin
  if v_actor_id is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'EXPENSE_ACCESS_DENIED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_EXPENSE_PAYLOAD';
  end if;
  if exists (
    select 1 from jsonb_object_keys(p_payload) as payload_keys(key)
    where key not in ('description', 'category', 'notes', 'expense_type', 'amount', 'occurred_at')
  ) then
    raise exception using errcode = '22023', message = 'UNSUPPORTED_EXPENSE_FIELDS';
  end if;

  v_description := trim(coalesce(p_payload->>'description', ''));
  v_category := trim(coalesce(p_payload->>'category', 'أخرى'));
  v_notes := coalesce(p_payload->>'notes', '');
  v_type := coalesce(p_payload->>'expense_type', 'daily');
  if length(v_description) not between 1 and 240 or length(v_category) not between 1 and 100
     or length(v_notes) > 2000 or v_type not in ('daily', 'monthly') then
    raise exception using errcode = '22023', message = 'INVALID_EXPENSE_FIELDS';
  end if;
  begin
    v_amount := (p_payload->>'amount')::numeric;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_EXPENSE_AMOUNT';
  end;
  if v_amount is null or v_amount <= 0 or v_amount > 999999999999.9999 then
    raise exception using errcode = '22023', message = 'INVALID_EXPENSE_AMOUNT';
  end if;
  begin
    v_occurred_at := coalesce(nullif(p_payload->>'occurred_at', '')::timestamptz, now());
  exception when invalid_text_representation or datetime_field_overflow then
    raise exception using errcode = '22023', message = 'INVALID_EXPENSE_DATE';
  end;

  if p_expense_id is null then
    insert into public.expenses(
      shop_id, description, category, amount, occurred_at, expense_type, notes, created_by
    ) values (
      p_shop_id, v_description, v_category, v_amount, v_occurred_at, v_type, v_notes, v_actor_id
    ) returning * into v_expense;
  else
    update public.expenses
    set description = v_description,
        category = v_category,
        amount = v_amount,
        occurred_at = v_occurred_at,
        expense_type = v_type,
        notes = v_notes,
        version = version + 1
    where id = p_expense_id and shop_id = p_shop_id and deleted_at is null
      and version = p_expected_version
    returning * into v_expense;
    if not found then
      raise exception using errcode = '40001', message = 'EXPENSE_VERSION_CONFLICT';
    end if;
  end if;
  return v_expense;
end;
$$;

create or replace function public.delete_expense(
  p_shop_id uuid,
  p_expense_id uuid,
  p_expected_version integer
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_new_version integer;
begin
  if v_actor_id is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'EXPENSE_ACCESS_DENIED';
  end if;
  update public.expenses
  set deleted_at = now(), version = version + 1
  where id = p_expense_id and shop_id = p_shop_id and deleted_at is null
    and version = p_expected_version
  returning version into v_new_version;
  if not found then
    raise exception using errcode = '40001', message = 'EXPENSE_VERSION_CONFLICT';
  end if;
  return v_new_version;
end;
$$;

create or replace function public.get_expense_summary(p_shop_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'EXPENSE_ACCESS_DENIED';
  end if;
  select jsonb_build_object(
    'total_revenue', coalesce(sum(i.total), 0),
    'total_profit', coalesce(sum(i.total - coalesce(costs.total_cost, 0)), 0)
  ) into v_result
  from public.invoices i
  left join (
    select invoice_id, shop_id, sum(quantity * unit_cost_snapshot) as total_cost
    from public.invoice_items
    group by invoice_id, shop_id
  ) costs on costs.invoice_id = i.id and costs.shop_id = i.shop_id
  where i.shop_id = p_shop_id and i.status = 'completed';
  return v_result;
end;
$$;

revoke all on function public.save_expense(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.delete_expense(uuid, uuid, integer) from public, anon;
revoke all on function public.get_expense_summary(uuid) from public, anon;
grant execute on function public.save_expense(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid, uuid, integer) to authenticated;
grant execute on function public.get_expense_summary(uuid) to authenticated;
grant select on public.expenses to authenticated;

drop trigger if exists expenses_emit_event on public.expenses;
create trigger expenses_emit_event
after insert or update or delete on public.expenses
for each row execute function public.emit_shop_change_event();

do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_catalog.pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'expenses'
     ) then
    execute 'alter publication supabase_realtime add table public.expenses';
  end if;
end;
$$;

commit;
