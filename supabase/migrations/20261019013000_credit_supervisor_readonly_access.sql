-- Credit ledger role alignment: supervisors may manage, sellers may read only.
-- Existing immutable ledger data is preserved; this migration only widens scoped access.

drop policy if exists shop_credit_accounts_manager_read on public.shop_credit_accounts;
drop policy if exists shop_credit_accounts_manager_insert on public.shop_credit_accounts;
drop policy if exists shop_credit_accounts_manager_update on public.shop_credit_accounts;
drop policy if exists shop_credit_transactions_manager_read on public.shop_credit_transactions;
drop policy if exists shop_credit_transactions_manager_insert on public.shop_credit_transactions;

create policy shop_credit_accounts_authorized_read on public.shop_credit_accounts for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor','seller']::public.shop_role[]) and deleted_at is null);
create policy shop_credit_accounts_management_insert on public.shop_credit_accounts for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shop_credit_accounts_management_update on public.shop_credit_accounts for update to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));
create policy shop_credit_transactions_authorized_read on public.shop_credit_transactions for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor','seller']::public.shop_role[]));
create policy shop_credit_transactions_management_insert on public.shop_credit_transactions for insert to authenticated
  with check (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

grant select, insert, update on public.shop_credit_accounts to authenticated;
grant select, insert on public.shop_credit_transactions to authenticated;

create or replace function public.create_shop_credit_account(
  p_shop_id uuid, p_party_type text, p_name text, p_phone text default '', p_notes text default '',
  p_initial_balance numeric default 0, p_initial_description text default 'رصيد افتتاحي'
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_account public.shop_credit_accounts; v_entry public.shop_credit_transactions;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'CREDIT_ACCOUNT_FORBIDDEN';
  end if;
  if p_party_type not in ('customer','supplier') or length(btrim(coalesce(p_name,''))) not between 1 and 200
     or abs(coalesce(p_initial_balance,0)) > 999999999999.9999 then
    raise exception using errcode = '22023', message = 'INVALID_CREDIT_ACCOUNT';
  end if;
  insert into public.shop_credit_accounts(shop_id,party_type,name,phone,notes)
  values (p_shop_id,p_party_type,btrim(p_name),coalesce(p_phone,''),coalesce(p_notes,'')) returning * into v_account;
  if coalesce(p_initial_balance,0) <> 0 then
    insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description)
    values (p_shop_id,v_account.id,'opening',abs(p_initial_balance),p_initial_balance,
      coalesce(nullif(btrim(p_initial_description),''),'رصيد افتتاحي')) returning * into v_entry;
  end if;
  return jsonb_build_object('account',to_jsonb(v_account),'opening',case when v_entry.id is null then null else to_jsonb(v_entry) end);
end;
$$;

create or replace function public.append_shop_credit_transaction(
  p_shop_id uuid, p_account_id uuid, p_entry_type text, p_amount numeric, p_balance_delta numeric,
  p_description text, p_notes text default '', p_occurred_at timestamptz default now()
) returns public.shop_credit_transactions language plpgsql security invoker set search_path = '' as $$
declare v_entry public.shop_credit_transactions;
begin
  if not public.has_shop_role(p_shop_id, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'CREDIT_TRANSACTION_FORBIDDEN';
  end if;
  if not exists (select 1 from public.shop_credit_accounts where id = p_account_id and shop_id = p_shop_id and deleted_at is null) then
    raise exception using errcode = '22023', message = 'CREDIT_ACCOUNT_NOT_ACTIVE';
  end if;
  if p_entry_type not in ('purchase','payment','return','adjustment') or p_amount is null or p_amount <= 0
     or p_amount > 999999999999.9999 or p_balance_delta is null or p_balance_delta = 0
     or abs(p_balance_delta) <> p_amount or length(btrim(coalesce(p_description,''))) not between 1 and 500 then
    raise exception using errcode = '22023', message = 'INVALID_CREDIT_TRANSACTION';
  end if;
  insert into public.shop_credit_transactions(shop_id,account_id,entry_type,amount,balance_delta,description,notes,occurred_at)
  values (p_shop_id,p_account_id,p_entry_type,p_amount,p_balance_delta,btrim(p_description),coalesce(p_notes,''),coalesce(p_occurred_at,now()))
  returning * into v_entry;
  return v_entry;
end;
$$;

revoke all on function public.create_shop_credit_account(uuid,text,text,text,text,numeric,text) from public, anon;
revoke all on function public.append_shop_credit_transaction(uuid,uuid,text,numeric,numeric,text,text,timestamptz) from public, anon;
grant execute on function public.create_shop_credit_account(uuid,text,text,text,text,numeric,text) to authenticated;
grant execute on function public.append_shop_credit_transaction(uuid,uuid,text,numeric,numeric,text,text,timestamptz) to authenticated;
