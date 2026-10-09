-- Bank checks are financial business rows, isolated by shop and guarded by versioned RPCs.
begin;

create table if not exists public.bank_checks (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  check_number text not null check (length(trim(check_number)) between 1 and 80),
  amount numeric(18,4) not null check (amount > 0),
  issue_date date not null,
  due_date date not null,
  bank_name text not null default '',
  account_holder text not null default '',
  status text not null default 'pending' check (status in ('pending', 'cleared', 'cancelled', 'returned')),
  direction text not null check (direction in ('outgoing', 'incoming')),
  notes text not null default '',
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (due_date >= issue_date),
  check (length(bank_name) <= 160 and length(account_holder) <= 200 and length(notes) <= 2000)
);
create index if not exists bank_checks_shop_due_idx on public.bank_checks(shop_id, due_date, id) where deleted_at is null;

alter table public.bank_checks enable row level security;
alter table public.bank_checks force row level security;
create policy bank_checks_manager_read on public.bank_checks for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
revoke all on public.bank_checks from anon, authenticated;
grant select on public.bank_checks to authenticated;

create or replace function public.save_bank_check(
  p_shop_id uuid,
  p_check_id uuid,
  p_expected_version integer,
  p_payload jsonb
) returns public.bank_checks
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_row public.bank_checks;
  v_check_number text;
  v_bank_name text;
  v_account_holder text;
  v_notes text;
  v_status text;
  v_direction text;
  v_amount numeric;
  v_issue_date date;
  v_due_date date;
begin
  if v_actor_id is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'BANK_CHECK_ACCESS_DENIED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_payload) as payload_keys(key)
    where key not in ('check_number','amount','issue_date','due_date','bank_name','account_holder','status','direction','notes')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_BANK_CHECK_PAYLOAD';
  end if;
  v_check_number := trim(coalesce(p_payload->>'check_number',''));
  v_bank_name := trim(coalesce(p_payload->>'bank_name',''));
  v_account_holder := trim(coalesce(p_payload->>'account_holder',''));
  v_notes := coalesce(p_payload->>'notes','');
  v_status := coalesce(p_payload->>'status','pending');
  v_direction := coalesce(p_payload->>'direction','');
  if length(v_check_number) not between 1 and 80 or length(v_bank_name) > 160
     or length(v_account_holder) > 200 or length(v_notes) > 2000
     or v_status not in ('pending','cleared','cancelled','returned')
     or v_direction not in ('outgoing','incoming') then
    raise exception using errcode = '22023', message = 'INVALID_BANK_CHECK_FIELDS';
  end if;
  begin
    v_amount := (p_payload->>'amount')::numeric;
    v_issue_date := (p_payload->>'issue_date')::date;
    v_due_date := (p_payload->>'due_date')::date;
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_BANK_CHECK_AMOUNT_OR_DATE';
  end;
  if v_amount is null or v_amount <= 0 or v_amount > 999999999999.9999
     or v_issue_date is null or v_due_date is null or v_due_date < v_issue_date then
    raise exception using errcode = '22023', message = 'INVALID_BANK_CHECK_AMOUNT_OR_DATE';
  end if;

  if p_check_id is null then
    insert into public.bank_checks(shop_id, check_number, amount, issue_date, due_date, bank_name, account_holder, status, direction, notes, created_by)
    values (p_shop_id, v_check_number, v_amount, v_issue_date, v_due_date, v_bank_name, v_account_holder, v_status, v_direction, v_notes, v_actor_id)
    returning * into v_row;
  else
    update public.bank_checks
    set check_number = v_check_number, amount = v_amount, issue_date = v_issue_date, due_date = v_due_date,
        bank_name = v_bank_name, account_holder = v_account_holder, status = v_status, direction = v_direction,
        notes = v_notes, version = version + 1
    where id = p_check_id and shop_id = p_shop_id and deleted_at is null and version = p_expected_version
    returning * into v_row;
    if not found then raise exception using errcode = '40001', message = 'BANK_CHECK_VERSION_CONFLICT'; end if;
  end if;
  return v_row;
end;
$$;

create or replace function public.delete_bank_check(p_shop_id uuid, p_check_id uuid, p_expected_version integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_version integer;
begin
  if auth.uid() is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'BANK_CHECK_ACCESS_DENIED';
  end if;
  update public.bank_checks set deleted_at = now(), version = version + 1
  where id = p_check_id and shop_id = p_shop_id and deleted_at is null and version = p_expected_version
  returning version into v_version;
  if not found then raise exception using errcode = '40001', message = 'BANK_CHECK_VERSION_CONFLICT'; end if;
  return v_version;
end;
$$;

revoke all on function public.save_bank_check(uuid,uuid,integer,jsonb) from public, anon;
revoke all on function public.delete_bank_check(uuid,uuid,integer) from public, anon;
grant execute on function public.save_bank_check(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.delete_bank_check(uuid,uuid,integer) to authenticated;

drop trigger if exists bank_checks_touch_updated_at on public.bank_checks;
create trigger bank_checks_touch_updated_at before update on public.bank_checks for each row execute function public.touch_updated_at();
drop trigger if exists bank_checks_emit_event on public.bank_checks;
create trigger bank_checks_emit_event after insert or update or delete on public.bank_checks for each row execute function public.emit_shop_change_event();

commit;
