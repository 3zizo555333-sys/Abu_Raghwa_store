-- Bot 2 only. Additive: keeps legacy Bot 1, existing supplier image_url values,
-- and current invoice write RPCs intact.

alter table public.supplier_invoices
  add column if not exists telegram_file_id text;

comment on column public.supplier_invoices.telegram_file_id is
  'Telegram Bot 2 file_id for archived supplier invoice image; image_url remains the legacy fallback.';

create table if not exists public.telegram_archive_settings (
  shop_id uuid primary key references public.shops(id) on delete cascade,
  bot_token_secret_id uuid,
  sales_channel_id text not null default '',
  archive_channel_id text not null default '',
  backup_channel_id text not null default '',
  is_enabled boolean not null default false,
  notify_live_sales boolean not null default true,
  notify_low_stock boolean not null default true,
  enable_daily_backup boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint telegram_archive_channel_id_length check (
    length(sales_channel_id) <= 100 and length(archive_channel_id) <= 100 and length(backup_channel_id) <= 100
  )
);

alter table public.telegram_archive_settings enable row level security;
revoke all on public.telegram_archive_settings from anon, authenticated;
grant select, insert, update on public.telegram_archive_settings to authenticated;

drop policy if exists telegram_archive_settings_manager_read on public.telegram_archive_settings;
create policy telegram_archive_settings_manager_read on public.telegram_archive_settings
  for select to authenticated using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
drop policy if exists telegram_archive_settings_manager_insert on public.telegram_archive_settings;
create policy telegram_archive_settings_manager_insert on public.telegram_archive_settings
  for insert to authenticated with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));
drop policy if exists telegram_archive_settings_manager_update on public.telegram_archive_settings;
create policy telegram_archive_settings_manager_update on public.telegram_archive_settings
  for update to authenticated using (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]))
  with check (public.has_shop_role(shop_id, array['manager','admin']::public.shop_role[]));

create table if not exists public.telegram_archive_outbox (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null check (event_type in ('sale_receipt','low_stock')),
  event_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','processing','delivered','failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists telegram_archive_outbox_pending_idx
  on public.telegram_archive_outbox(status, next_attempt_at, created_at);
create index if not exists telegram_archive_outbox_shop_idx
  on public.telegram_archive_outbox(shop_id, created_at desc);
alter table public.telegram_archive_outbox enable row level security;
revoke all on public.telegram_archive_outbox from anon, authenticated;
grant select, insert, update, delete on public.telegram_archive_outbox to service_role;

create or replace function public.get_telegram_archive_settings_v1(p_shop_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_row public.telegram_archive_settings%rowtype;
begin
  if auth.uid() is null or not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception using errcode='42501', message='MANAGER_REQUIRED';
  end if;
  select * into v_row from public.telegram_archive_settings where shop_id = p_shop_id;
  if not found then
    return jsonb_build_object('shop_id',p_shop_id,'sales_channel_id','','archive_channel_id','','backup_channel_id','',
      'is_enabled',false,'notify_live_sales',true,'notify_low_stock',true,'enable_daily_backup',true,'has_bot_token',false);
  end if;
  return jsonb_build_object('shop_id',v_row.shop_id,'sales_channel_id',v_row.sales_channel_id,
    'archive_channel_id',v_row.archive_channel_id,'backup_channel_id',v_row.backup_channel_id,
    'is_enabled',v_row.is_enabled,'notify_live_sales',v_row.notify_live_sales,
    'notify_low_stock',v_row.notify_low_stock,'enable_daily_backup',v_row.enable_daily_backup,
    'has_bot_token',v_row.bot_token_secret_id is not null);
end;
$$;

create or replace function public.save_telegram_archive_settings_v1(
  p_shop_id uuid,
  p_sales_channel_id text,
  p_archive_channel_id text,
  p_backup_channel_id text,
  p_is_enabled boolean,
  p_notify_live_sales boolean,
  p_notify_low_stock boolean,
  p_enable_daily_backup boolean,
  p_bot_token text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, vault
as $$
declare v_secret_id uuid; v_name text; v_id text;
begin
  if auth.uid() is null or not public.has_shop_role(p_shop_id, array['manager','admin']::public.shop_role[]) then
    raise exception using errcode='42501', message='MANAGER_REQUIRED';
  end if;
  if coalesce(length(p_sales_channel_id),0)>100 or coalesce(length(p_archive_channel_id),0)>100 or coalesce(length(p_backup_channel_id),0)>100 then
    raise exception using errcode='22023', message='CHANNEL_ID_TOO_LONG';
  end if;
  foreach v_id in array array[coalesce(p_sales_channel_id,''),coalesce(p_archive_channel_id,''),coalesce(p_backup_channel_id,'')] loop
    if v_id <> '' and v_id !~ '^(-?[0-9]{1,25}|@[A-Za-z0-9_]{5,32})$' then
      raise exception using errcode='22023', message='INVALID_TELEGRAM_CHANNEL_ID';
    end if;
  end loop;
  if p_is_enabled and (coalesce(p_sales_channel_id,'')='' or coalesce(p_archive_channel_id,'')='' or coalesce(p_backup_channel_id,'')='') then
    raise exception using errcode='22023', message='ALL_THREE_CHANNELS_REQUIRED';
  end if;
  if p_bot_token is not null and btrim(p_bot_token) <> '' and (length(btrim(p_bot_token)) > 300 or p_bot_token !~ '^[0-9]{5,12}:[A-Za-z0-9_-]{20,}$') then
    raise exception using errcode='22023', message='INVALID_BOT_TOKEN_FORMAT';
  end if;

  perform 1 from public.shops where id=p_shop_id for update;
  select bot_token_secret_id into v_secret_id from public.telegram_archive_settings where shop_id=p_shop_id for update;
  if p_is_enabled and (nullif(btrim(coalesce(p_bot_token,'')),'') is null and v_secret_id is null) then
    raise exception using errcode='22023', message='BOT_TOKEN_REQUIRED';
  end if;
  if p_bot_token is not null and btrim(p_bot_token) <> '' then
    if v_secret_id is null then
      v_secret_id := vault.create_secret(btrim(p_bot_token), 'telegram_archive_bot_'||p_shop_id::text,
        'Encrypted Telegram Bot 2 token for shop '||p_shop_id::text, null);
    else
      perform vault.update_secret(v_secret_id, btrim(p_bot_token), 'telegram_archive_bot_'||p_shop_id::text,
        'Encrypted Telegram Bot 2 token for shop '||p_shop_id::text, null);
    end if;
  end if;

  insert into public.telegram_archive_settings(shop_id,bot_token_secret_id,sales_channel_id,archive_channel_id,backup_channel_id,
    is_enabled,notify_live_sales,notify_low_stock,enable_daily_backup,updated_at)
  values(p_shop_id,v_secret_id,coalesce(p_sales_channel_id,''),coalesce(p_archive_channel_id,''),coalesce(p_backup_channel_id,''),
    coalesce(p_is_enabled,false),coalesce(p_notify_live_sales,true),coalesce(p_notify_low_stock,true),coalesce(p_enable_daily_backup,true),now())
  on conflict(shop_id) do update set bot_token_secret_id=excluded.bot_token_secret_id,
    sales_channel_id=excluded.sales_channel_id,archive_channel_id=excluded.archive_channel_id,backup_channel_id=excluded.backup_channel_id,
    is_enabled=excluded.is_enabled,notify_live_sales=excluded.notify_live_sales,notify_low_stock=excluded.notify_low_stock,
    enable_daily_backup=excluded.enable_daily_backup,updated_at=now();
  return public.get_telegram_archive_settings_v1(p_shop_id);
end;
$$;

create or replace function public.get_telegram_archive_bot_token_v1(p_shop_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare v_secret_id uuid; v_token text;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501', message='SERVICE_ROLE_REQUIRED';
  end if;
  select bot_token_secret_id into v_secret_id from public.telegram_archive_settings
    where shop_id=p_shop_id;
  if v_secret_id is null then return null; end if;
  select decrypted_secret into v_token from vault.decrypted_secrets where id=v_secret_id;
  return v_token;
end;
$$;

revoke all on function public.get_telegram_archive_settings_v1(uuid) from public, anon;
grant execute on function public.get_telegram_archive_settings_v1(uuid) to authenticated;
revoke all on function public.save_telegram_archive_settings_v1(uuid,text,text,text,boolean,boolean,boolean,boolean,text) from public, anon;
grant execute on function public.save_telegram_archive_settings_v1(uuid,text,text,text,boolean,boolean,boolean,boolean,text) to authenticated;
revoke all on function public.get_telegram_archive_bot_token_v1(uuid) from public, anon, authenticated;
grant execute on function public.get_telegram_archive_bot_token_v1(uuid) to service_role;

create or replace function public.enqueue_telegram_sale_receipt_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status='completed' then
    insert into public.telegram_archive_outbox(shop_id,event_type,event_key,payload)
    values(new.shop_id,'sale_receipt','sale:'||new.id::text,jsonb_build_object('invoice_id',new.id))
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists telegram_archive_enqueue_sale_receipt on public.invoices;
create trigger telegram_archive_enqueue_sale_receipt after insert on public.invoices
  for each row execute function public.enqueue_telegram_sale_receipt_v1();

create or replace function public.enqueue_telegram_low_stock_v1()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.deleted_at is null and new.min_quantity > 0 and new.quantity <= new.min_quantity
    and (tg_op='INSERT' or old.quantity > old.min_quantity or old.min_quantity is distinct from new.min_quantity) then
    insert into public.telegram_archive_outbox(shop_id,event_type,event_key,payload)
    values(new.shop_id,'low_stock','lowstock:'||new.id::text||':'||to_char(now() at time zone 'UTC','YYYYMMDD'),
      jsonb_build_object('product_id',new.id,'product_name',new.name,'quantity',new.quantity,'min_quantity',new.min_quantity))
    on conflict(event_key) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists telegram_archive_enqueue_low_stock on public.products;
create trigger telegram_archive_enqueue_low_stock after insert or update on public.products
  for each row execute function public.enqueue_telegram_low_stock_v1();

create or replace function public.claim_telegram_archive_outbox_v1(p_shop_id uuid default null,p_limit integer default 25)
returns table(id uuid,shop_id uuid,event_type text,event_key text,payload jsonb,attempts integer)
language sql security definer set search_path=public as $$
  with candidates as (
    select o.id from public.telegram_archive_outbox o
    where (p_shop_id is null or o.shop_id=p_shop_id)
      and ((o.status='pending' and o.next_attempt_at<=now())
       or (o.status='processing' and o.locked_at < now()-interval '10 minutes')
      )
    order by o.created_at
    limit greatest(1,least(coalesce(p_limit,25),50))
    for update skip locked
  ), claimed as (
    update public.telegram_archive_outbox o set status='processing',locked_at=now(),attempts=o.attempts+1
    from candidates c where o.id=c.id
    returning o.id,o.shop_id,o.event_type,o.event_key,o.payload,o.attempts
  ) select * from claimed;
$$;

create or replace function public.finish_telegram_archive_outbox_v1(p_id uuid,p_success boolean,p_error text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.telegram_archive_outbox set
    status=case when p_success then 'delivered' when attempts>=8 then 'failed' else 'pending' end,
    delivered_at=case when p_success then now() else delivered_at end,
    locked_at=null,
    next_attempt_at=case when p_success then next_attempt_at else now()+make_interval(secs=>least(3600,(30*power(2,least(attempts,7)))::integer)) end,
    last_error=case when p_success then null else left(coalesce(p_error,'Telegram delivery failed'),300) end
  where id=p_id;
end;
$$;

revoke all on function public.claim_telegram_archive_outbox_v1(uuid,integer) from public, anon, authenticated;
grant execute on function public.claim_telegram_archive_outbox_v1(uuid,integer) to service_role;
revoke all on function public.finish_telegram_archive_outbox_v1(uuid,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_telegram_archive_outbox_v1(uuid,boolean,text) to service_role;


-- The app server verifies the authenticated manager/supervisor before invoking
-- this service-role-only RPC. The legacy save_supplier_invoice_v1 remains intact.
create or replace function public.save_supplier_invoice_v2(
  p_store_id uuid,
  p_category_id uuid,
  p_supplier_name text,
  p_invoice_date date,
  p_image_url text,
  p_telegram_file_id text,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices%rowtype;
  v_item jsonb;
  v_item_name text;
  v_barcode text;
  v_quantity numeric(14,3);
  v_unit_cost numeric(14,4);
  v_total_cost numeric(14,2);
  v_previous_cost numeric(14,4);
  v_price_diff numeric(14,4);
  v_price_direction text;
  v_total_amount numeric(14,2) := 0;
  v_items jsonb;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception using errcode='42501', message='SERVICE_ROLE_REQUIRED';
  end if;
  if p_store_id is null then raise exception using errcode='22023', message='INVALID_STORE'; end if;
  if p_supplier_name is null or length(trim(p_supplier_name)) not between 1 and 180 then
    raise exception using errcode='22023', message='INVALID_SUPPLIER_NAME';
  end if;
  if length(coalesce(p_image_url,'')) > 4096 or length(coalesce(p_telegram_file_id,'')) > 512
     or (coalesce(trim(p_image_url),'')='' and coalesce(trim(p_telegram_file_id),'')='') then
    raise exception using errcode='22023', message='INVOICE_IMAGE_REQUIRED';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 300 then
    raise exception using errcode='22023', message='INVALID_INVOICE_ITEMS';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.supplier_invoice_categories c where c.id=p_category_id and c.store_id=p_store_id::text
  ) then raise exception using errcode='22023', message='INVALID_INVOICE_CATEGORY'; end if;

  insert into public.supplier_invoices(store_id,category_id,supplier_name,invoice_date,image_url,telegram_file_id,total_amount,notes)
  values(p_store_id::text,p_category_id,trim(p_supplier_name),coalesce(p_invoice_date,current_date),coalesce(p_image_url,''),
    nullif(trim(coalesce(p_telegram_file_id,'')),''),0,coalesce(left(p_notes,4000),'')) returning * into v_invoice;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_item_name := trim(coalesce(v_item->>'item_name',''));
    if length(v_item_name) not between 1 and 180 then raise exception using errcode='22023', message='INVALID_INVOICE_ITEM_NAME'; end if;
    v_quantity := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_unit_cost := coalesce(nullif(v_item->>'unit_cost','')::numeric,0);
    if v_quantity<=0 or v_unit_cost<0 then raise exception using errcode='22023', message='INVALID_INVOICE_ITEM_AMOUNT'; end if;
    v_barcode := nullif(left(trim(coalesce(v_item->>'barcode','')),120),'');
    v_previous_cost := nullif(v_item->>'previous_cost','')::numeric;
    v_total_cost := coalesce(nullif(v_item->>'total_cost','')::numeric,round(v_quantity*v_unit_cost,2));
    if v_total_cost<0 then raise exception using errcode='22023', message='INVALID_INVOICE_ITEM_TOTAL'; end if;
    v_price_diff := case when v_previous_cost is null then null else round(v_unit_cost-v_previous_cost,4) end;
    v_price_direction := case when v_price_diff is null or abs(v_price_diff)<0.0001 then 'stable' when v_price_diff>0 then 'up' else 'down' end;
    insert into public.supplier_invoice_items(invoice_id,item_name,barcode,quantity,unit_cost,total_cost,previous_cost,price_diff,price_direction)
    values(v_invoice.id,v_item_name,v_barcode,v_quantity,v_unit_cost,v_total_cost,v_previous_cost,v_price_diff,v_price_direction);
    v_total_amount := v_total_amount+v_total_cost;
  end loop;

  update public.supplier_invoices set total_amount=round(v_total_amount,2) where id=v_invoice.id returning * into v_invoice;
  select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at,i.id),'[]'::jsonb) into v_items
    from public.supplier_invoice_items i where i.invoice_id=v_invoice.id;
  return jsonb_build_object('invoice',to_jsonb(v_invoice),'items',v_items);
end;
$$;
revoke all on function public.save_supplier_invoice_v2(uuid,uuid,text,date,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.save_supplier_invoice_v2(uuid,uuid,text,date,text,text,text,jsonb) to service_role;
