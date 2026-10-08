-- Manual deferred-sale check records are separate from negotiable bank checks.
begin;

create table if not exists public.deferred_check_records (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 200),
  employee_name text not null check (length(trim(employee_name)) between 1 and 200),
  products_list text not null default '' check (length(products_list) <= 4000),
  invoice_number text not null default '' check (length(invoice_number) <= 80),
  total_amount numeric(18,4) not null check (total_amount > 0),
  paid_amount numeric(18,4) not null default 0 check (paid_amount >= 0 and paid_amount <= total_amount),
  remaining_amount numeric(18,4) generated always as (total_amount - paid_amount) stored,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists deferred_checks_shop_created_idx on public.deferred_check_records(shop_id, created_at desc, id desc) where deleted_at is null;

alter table public.deferred_check_records enable row level security;
alter table public.deferred_check_records force row level security;
create policy deferred_checks_manager_read on public.deferred_check_records for select to authenticated
  using (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]) and deleted_at is null);
revoke all on public.deferred_check_records from anon, authenticated;
grant select on public.deferred_check_records to authenticated;

create or replace function public.create_deferred_check_record(p_shop_id uuid, p_payload jsonb)
returns public.deferred_check_records
language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_row public.deferred_check_records;
  v_customer text;
  v_employee text;
  v_products text;
  v_invoice text;
  v_total numeric;
  v_paid numeric;
begin
  if v_actor_id is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'DEFERRED_CHECK_ACCESS_DENIED';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or exists (
    select 1 from jsonb_object_keys(p_payload) as payload_keys(key)
    where key not in ('customer_name','employee_name','products_list','invoice_number','total_amount','paid_amount')
  ) then
    raise exception using errcode = '22023', message = 'INVALID_DEFERRED_CHECK_PAYLOAD';
  end if;
  v_customer := trim(coalesce(p_payload->>'customer_name',''));
  v_employee := trim(coalesce(p_payload->>'employee_name',''));
  v_products := coalesce(p_payload->>'products_list','');
  v_invoice := coalesce(p_payload->>'invoice_number','');
  if length(v_customer) not between 1 and 200 or length(v_employee) not between 1 and 200
     or length(v_products) > 4000 or length(v_invoice) > 80 then
    raise exception using errcode = '22023', message = 'INVALID_DEFERRED_CHECK_FIELDS';
  end if;
  begin
    v_total := (p_payload->>'total_amount')::numeric;
    v_paid := coalesce(nullif(p_payload->>'paid_amount','')::numeric, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '22023', message = 'INVALID_DEFERRED_CHECK_AMOUNTS';
  end;
  if v_total is null or v_total <= 0 or v_total > 999999999999.9999
     or v_paid is null or v_paid < 0 or v_paid > v_total then
    raise exception using errcode = '22023', message = 'INVALID_DEFERRED_CHECK_AMOUNTS';
  end if;
  insert into public.deferred_check_records(
    shop_id, customer_name, employee_name, products_list, invoice_number, total_amount, paid_amount, created_by
  ) values (
    p_shop_id, v_customer, v_employee, v_products, v_invoice, v_total, v_paid, v_actor_id
  ) returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.delete_deferred_check_record(p_shop_id uuid, p_record_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not public.has_shop_role(
    p_shop_id, array['manager','admin','supervisor']::public.shop_role[]
  ) then
    raise exception using errcode = '42501', message = 'DEFERRED_CHECK_ACCESS_DENIED';
  end if;
  update public.deferred_check_records set deleted_at = now()
  where id = p_record_id and shop_id = p_shop_id and deleted_at is null;
  if not found then return false; end if;
  return true;
end;
$$;

revoke all on function public.create_deferred_check_record(uuid,jsonb) from public, anon;
revoke all on function public.delete_deferred_check_record(uuid,uuid) from public, anon;
grant execute on function public.create_deferred_check_record(uuid,jsonb) to authenticated;
grant execute on function public.delete_deferred_check_record(uuid,uuid) to authenticated;

drop trigger if exists deferred_checks_emit_event on public.deferred_check_records;
create trigger deferred_checks_emit_event after insert or update or delete on public.deferred_check_records
for each row execute function public.emit_shop_change_event();

commit;
