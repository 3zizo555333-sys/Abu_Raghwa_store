begin;

-- Do not reveal winner identity until the six-second draw has completed.
create or replace function public.sync_community_draw_live_stage() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_name text; v_phone text; v_code text; v_prize text; v_type text;
begin
  if tg_table_name='purchase_raffles' then
    v_type:='purchase'; v_prize:=new.prize_name;
    if new.winner_entry_id is not null and new.status='completed' then
      select t.customer_name,t.customer_phone,t.ticket_number into v_name,v_phone,v_code from public.raffle_tickets t where t.id=new.winner_entry_id and t.raffle_id=new.id;
    end if;
  else
    v_type:='trivia'; v_prize:=new.prize_title;
    if new.winner_entry_id is not null and new.status='completed' then
      select e.customer_name,e.customer_phone,e.entry_code into v_name,v_phone,v_code from public.trivia_entries e where e.id=new.winner_entry_id and e.contest_id=new.id;
    end if;
  end if;
  insert into public.community_draw_live_stage(shop_id,event_type,event_id,title,prize_title,ends_at,status,winner_name,winner_phone_masked,winner_code,updated_at)
  values(new.shop_id,v_type,new.id,new.title,v_prize,new.ends_at,new.status,v_name,case when v_phone is null then null else public.mask_community_phone(v_phone) end,v_code,now())
  on conflict(event_type,event_id) do update set title=excluded.title,prize_title=excluded.prize_title,ends_at=excluded.ends_at,status=excluded.status,winner_name=excluded.winner_name,winner_phone_masked=excluded.winner_phone_masked,winner_code=excluded.winner_code,updated_at=now();
  return new;
end $$;

-- Allow eligibility to be authored with a category UUID or the readable category name.
create or replace function public.register_purchase_raffle_ticket(p_raffle_id uuid,p_customer_name text,p_customer_phone text,p_invoice_code text)
returns table(ticket_id uuid,ticket_number text) language plpgsql security definer set search_path='' as $$
declare v_raffle public.purchase_raffles%rowtype; v_invoice public.invoices%rowtype; v_phone text; v_code text; v_id uuid; v_number text; v_rule jsonb; v_need numeric; v_product_id uuid; v_name text; v_category text;
begin
  v_phone:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g'); v_code:=trim(coalesce(p_invoice_code,''));
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 120 or length(v_phone) not between 7 and 15 or v_code='' then raise exception using errcode='22023',message='INVALID_CUSTOMER_OR_INVOICE'; end if;
  select * into v_raffle from public.purchase_raffles where id=p_raffle_id and status='active' for update;
  if not found or v_raffle.ends_at<=now() then raise exception using errcode='P0002',message='RAFFLE_NOT_ACTIVE'; end if;
  select i.* into v_invoice from public.invoices i where i.shop_id=v_raffle.shop_id and i.invoice_number=v_code and i.status='completed' and regexp_replace(coalesce(i.customer_phone,''),'[^0-9]','','g')=v_phone limit 1;
  if not found then raise exception using errcode='22023',message='INVOICE_NOT_MATCHING_CUSTOMER'; end if;
  if v_raffle.min_invoice_total is not null and v_invoice.total<v_raffle.min_invoice_total then raise exception using errcode='22023',message='INVOICE_TOTAL_BELOW_MINIMUM'; end if;
  if v_raffle.required_products_rules ? 'min_invoice_total' and v_invoice.total<(v_raffle.required_products_rules->>'min_invoice_total')::numeric then raise exception using errcode='22023',message='INVOICE_TOTAL_BELOW_RULE'; end if;
  if v_raffle.required_products_rules ? 'items' then
    for v_rule in select value from jsonb_array_elements(v_raffle.required_products_rules->'items') loop
      v_need:=greatest(1,coalesce((v_rule->>'min_quantity')::numeric,1)); v_product_id:=nullif(v_rule->>'product_id','')::uuid; v_name:=nullif(trim(v_rule->>'name'),'');
      if v_product_id is null and v_name is null then raise exception using errcode='22023',message='INVALID_RAFFLE_PRODUCT_RULE'; end if;
      if coalesce((select sum(ii.quantity) from public.invoice_items ii where ii.invoice_id=v_invoice.id and ((v_product_id is not null and ii.product_id=v_product_id) or (v_name is not null and lower(ii.product_name_snapshot)=lower(v_name)))),0)<v_need then raise exception using errcode='22023',message='REQUIRED_PRODUCT_NOT_IN_INVOICE'; end if;
    end loop;
  end if;
  if v_raffle.required_products_rules ? 'category_ids' then
    for v_category in select jsonb_array_elements_text(v_raffle.required_products_rules->'category_ids') loop
      if not exists(select 1 from public.invoice_items ii join public.products p on p.id=ii.product_id and p.shop_id=v_invoice.shop_id where ii.invoice_id=v_invoice.id and p.category_id::text=v_category) then raise exception using errcode='22023',message='REQUIRED_CATEGORY_NOT_IN_INVOICE'; end if;
    end loop;
  end if;
  if v_raffle.required_products_rules ? 'category_names' then
    for v_category in select jsonb_array_elements_text(v_raffle.required_products_rules->'category_names') loop
      if not exists(select 1 from public.invoice_items ii join public.products p on p.id=ii.product_id and p.shop_id=v_invoice.shop_id join public.product_categories c on c.id=p.category_id and c.shop_id=v_invoice.shop_id where ii.invoice_id=v_invoice.id and lower(c.name)=lower(v_category)) then raise exception using errcode='22023',message='REQUIRED_CATEGORY_NOT_IN_INVOICE'; end if;
    end loop;
  end if;
  v_number:='#R-'||nextval('public.purchase_raffle_ticket_number_seq')::text;
  insert into public.raffle_tickets(shop_id,raffle_id,customer_name,customer_phone,invoice_code,ticket_number) values(v_raffle.shop_id,v_raffle.id,trim(p_customer_name),v_phone,v_code,v_number) returning id into v_id;
  return query select v_id,v_number;
exception when unique_violation then raise exception using errcode='23505',message='INVOICE_ALREADY_USED';
end $$;

notify pgrst,'reload schema';
commit;
