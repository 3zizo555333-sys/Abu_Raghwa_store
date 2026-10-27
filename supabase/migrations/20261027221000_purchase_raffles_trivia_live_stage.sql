begin;

create sequence if not exists public.purchase_raffle_ticket_number_seq start with 101;
create sequence if not exists public.trivia_entry_number_seq start with 501;
do $$ begin
  create type public.community_draw_status as enum ('active','drawing','completed');
exception when duplicate_object then null; end $$;

create table if not exists public.purchase_raffles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  description text not null default '',
  banner_image_url text,
  prize_name text not null check (length(trim(prize_name)) between 1 and 180),
  prize_image_url text,
  prize_description text not null default '',
  required_products_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(required_products_rules)='object'),
  min_invoice_total numeric(12,2) check (min_invoice_total is null or min_invoice_total >= 0),
  ends_at timestamptz not null,
  status public.community_draw_status not null default 'active',
  winner_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id)
);
create index if not exists purchase_raffles_shop_status_idx on public.purchase_raffles(shop_id,status,ends_at desc);

create table if not exists public.raffle_tickets (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  raffle_id uuid not null references public.purchase_raffles(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_phone text not null check (customer_phone ~ '^[0-9]{7,15}$'),
  invoice_code text not null,
  ticket_number text not null,
  created_at timestamptz not null default now(),
  unique (raffle_id, invoice_code),
  unique (raffle_id, ticket_number),
  unique (id, raffle_id),
  foreign key (raffle_id, shop_id) references public.purchase_raffles(id,shop_id) on delete cascade
);
create index if not exists raffle_tickets_raffle_created_idx on public.raffle_tickets(raffle_id,created_at desc);

create table if not exists public.trivia_contests (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 180),
  question text not null check (length(trim(question)) between 1 and 1000),
  options jsonb not null check (jsonb_typeof(options)='array' and jsonb_array_length(options) between 2 and 8),
  correct_option_index integer not null check (correct_option_index >= 0),
  prize_title text not null check (length(trim(prize_title)) between 1 and 180),
  prize_image_url text,
  ends_at timestamptz not null,
  status public.community_draw_status not null default 'active',
  winner_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, shop_id),
  check (correct_option_index < jsonb_array_length(options))
);
create index if not exists trivia_contests_shop_status_idx on public.trivia_contests(shop_id,status,ends_at desc);

create table if not exists public.trivia_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  contest_id uuid not null references public.trivia_contests(id) on delete cascade,
  customer_name text not null check (length(trim(customer_name)) between 1 and 120),
  customer_phone text not null check (customer_phone ~ '^[0-9]{7,15}$'),
  selected_option integer not null check (selected_option >= 0),
  is_correct boolean not null,
  entry_code text not null,
  created_at timestamptz not null default now(),
  unique (contest_id, customer_phone),
  unique (contest_id, entry_code),
  unique (id, contest_id),
  foreign key (contest_id, shop_id) references public.trivia_contests(id,shop_id) on delete cascade
);
create index if not exists trivia_entries_contest_correct_idx on public.trivia_entries(contest_id,is_correct,created_at desc);

alter table public.purchase_raffles add constraint purchase_raffles_winner_fk foreign key (winner_entry_id, id) references public.raffle_tickets(id, raffle_id) on delete set null (winner_entry_id);
alter table public.trivia_contests add constraint trivia_contests_winner_fk foreign key (winner_entry_id, id) references public.trivia_entries(id, contest_id) on delete set null (winner_entry_id);

-- Sanitized, public-only state is the single source for customer-facing live animation.
create table if not exists public.community_draw_live_stage (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  event_type text not null check (event_type in ('purchase','trivia')),
  event_id uuid not null,
  title text not null,
  prize_title text not null,
  ends_at timestamptz not null,
  status public.community_draw_status not null,
  winner_name text,
  winner_phone_masked text,
  winner_code text,
  updated_at timestamptz not null default now(),
  unique(event_type,event_id)
);
create index if not exists community_draw_live_stage_shop_idx on public.community_draw_live_stage(shop_id,updated_at desc);

create or replace function public.mask_community_phone(p_phone text) returns text
language sql immutable set search_path='' as $$
  select case when length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g')) >= 7 then
    left(regexp_replace(p_phone,'[^0-9]','','g'),3) || '****' || right(regexp_replace(p_phone,'[^0-9]','','g'),4)
    else '***' end;
$$;

create or replace function public.sync_community_draw_live_stage() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_name text; v_phone text; v_code text; v_prize text; v_type text;
begin
  if tg_table_name='purchase_raffles' then
    v_type := 'purchase'; v_prize := new.prize_name;
    if new.winner_entry_id is not null then select t.customer_name,t.customer_phone,t.ticket_number into v_name,v_phone,v_code from public.raffle_tickets t where t.id=new.winner_entry_id and t.raffle_id=new.id; end if;
    insert into public.community_draw_live_stage(shop_id,event_type,event_id,title,prize_title,ends_at,status,winner_name,winner_phone_masked,winner_code,updated_at)
    values(new.shop_id,v_type,new.id,new.title,v_prize,new.ends_at,new.status,v_name,case when v_phone is null then null else public.mask_community_phone(v_phone) end,v_code,now())
    on conflict(event_type,event_id) do update set title=excluded.title,prize_title=excluded.prize_title,ends_at=excluded.ends_at,status=excluded.status,winner_name=excluded.winner_name,winner_phone_masked=excluded.winner_phone_masked,winner_code=excluded.winner_code,updated_at=now();
  else
    v_type := 'trivia'; v_prize := new.prize_title;
    if new.winner_entry_id is not null then select e.customer_name,e.customer_phone,e.entry_code into v_name,v_phone,v_code from public.trivia_entries e where e.id=new.winner_entry_id and e.contest_id=new.id; end if;
    insert into public.community_draw_live_stage(shop_id,event_type,event_id,title,prize_title,ends_at,status,winner_name,winner_phone_masked,winner_code,updated_at)
    values(new.shop_id,v_type,new.id,new.title,v_prize,new.ends_at,new.status,v_name,case when v_phone is null then null else public.mask_community_phone(v_phone) end,v_code,now())
    on conflict(event_type,event_id) do update set title=excluded.title,prize_title=excluded.prize_title,ends_at=excluded.ends_at,status=excluded.status,winner_name=excluded.winner_name,winner_phone_masked=excluded.winner_phone_masked,winner_code=excluded.winner_code,updated_at=now();
  end if;
  return new;
end $$;
create trigger purchase_raffles_live_stage after insert or update on public.purchase_raffles for each row execute function public.sync_community_draw_live_stage();
create trigger trivia_contests_live_stage after insert or update on public.trivia_contests for each row execute function public.sync_community_draw_live_stage();

alter table public.purchase_raffles enable row level security;
alter table public.raffle_tickets enable row level security;
alter table public.trivia_contests enable row level security;
alter table public.trivia_entries enable row level security;
alter table public.community_draw_live_stage enable row level security;

create policy purchase_raffles_staff_all on public.purchase_raffles for all to authenticated using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[])) with check (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));
create policy raffle_tickets_staff_read on public.raffle_tickets for select to authenticated using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));
create policy raffle_tickets_staff_delete on public.raffle_tickets for delete to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
create policy trivia_contests_staff_all on public.trivia_contests for all to authenticated using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[])) with check (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));
create policy trivia_entries_staff_read on public.trivia_entries for select to authenticated using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));
create policy trivia_entries_staff_delete on public.trivia_entries for delete to authenticated using (public.has_shop_role(shop_id,array['manager','admin']::public.shop_role[]));
create policy community_draw_stage_public_read on public.community_draw_live_stage for select to anon,authenticated using (true);
create policy community_draw_stage_staff_all on public.community_draw_live_stage for all to authenticated using (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[])) with check (public.has_shop_role(shop_id,array['manager','admin','supervisor']::public.shop_role[]));

-- Customer-visible views intentionally omit correct answers, raw phone numbers, and all participant rows.
create or replace view public.public_purchase_raffles with (security_barrier=true) as
 select id,shop_id,title,description,banner_image_url,prize_name,prize_image_url,prize_description,required_products_rules,min_invoice_total,ends_at,status,created_at
 from public.purchase_raffles where status in ('active','drawing','completed');
create or replace view public.public_trivia_contests with (security_barrier=true) as
 select id,shop_id,title,question,options,prize_title,prize_image_url,ends_at,status,created_at
 from public.trivia_contests where status in ('active','drawing','completed');
grant select on public.public_purchase_raffles,public.public_trivia_contests to anon,authenticated;
grant select,insert,update,delete on public.purchase_raffles,public.trivia_contests to authenticated;
grant select,delete on public.raffle_tickets,public.trivia_entries to authenticated;
grant select on public.community_draw_live_stage to anon,authenticated;
revoke all on public.purchase_raffles,public.raffle_tickets,public.trivia_contests,public.trivia_entries,public.community_draw_live_stage from anon;
revoke insert,update on public.raffle_tickets,public.trivia_entries,public.community_draw_live_stage from authenticated;

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
  if v_raffle.required_products_rules ? 'min_invoice_total' then
    if v_invoice.total < (v_raffle.required_products_rules->>'min_invoice_total')::numeric then raise exception using errcode='22023',message='INVOICE_TOTAL_BELOW_RULE'; end if;
  end if;
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
  v_number:='#R-'||nextval('public.purchase_raffle_ticket_number_seq')::text;
  insert into public.raffle_tickets(shop_id,raffle_id,customer_name,customer_phone,invoice_code,ticket_number)
  values(v_raffle.shop_id,v_raffle.id,trim(p_customer_name),v_phone,v_code,v_number) returning id into v_id;
  return query select v_id,v_number;
exception when unique_violation then raise exception using errcode='23505',message='INVOICE_ALREADY_USED';
end $$;

create or replace function public.submit_trivia_entry(p_contest_id uuid,p_customer_name text,p_customer_phone text,p_selected_option integer)
returns table(entry_id uuid,entry_code text,is_correct boolean) language plpgsql security definer set search_path='' as $$
declare v_contest public.trivia_contests%rowtype; v_phone text; v_code text; v_correct boolean; v_id uuid;
begin
  v_phone:=regexp_replace(coalesce(p_customer_phone,''),'[^0-9]','','g');
  if length(trim(coalesce(p_customer_name,''))) not between 1 and 120 or length(v_phone) not between 7 and 15 then raise exception using errcode='22023',message='INVALID_CUSTOMER'; end if;
  select * into v_contest from public.trivia_contests where id=p_contest_id and status='active' for update;
  if not found or v_contest.ends_at<=now() then raise exception using errcode='P0002',message='CONTEST_NOT_ACTIVE'; end if;
  if p_selected_option<0 or p_selected_option>=jsonb_array_length(v_contest.options) then raise exception using errcode='22023',message='INVALID_OPTION'; end if;
  v_correct:=p_selected_option=v_contest.correct_option_index; v_code:='#Q-'||nextval('public.trivia_entry_number_seq')::text;
  insert into public.trivia_entries(shop_id,contest_id,customer_name,customer_phone,selected_option,is_correct,entry_code)
  values(v_contest.shop_id,v_contest.id,trim(p_customer_name),v_phone,p_selected_option,v_correct,v_code) returning id into v_id;
  return query select v_id,v_code,v_correct;
exception when unique_violation then raise exception using errcode='23505',message='PHONE_ALREADY_ENTERED';
end $$;

create or replace function public.start_community_draw(p_event_type text,p_event_id uuid)
returns public.community_draw_live_stage language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_winner uuid; v_ends timestamptz; v_status public.community_draw_status; v_stage public.community_draw_live_stage%rowtype;
begin
  if p_event_type='purchase' then
    select shop_id,ends_at,status into v_shop,v_ends,v_status from public.purchase_raffles where id=p_event_id for update;
  elsif p_event_type='trivia' then
    select shop_id,ends_at,status into v_shop,v_ends,v_status from public.trivia_contests where id=p_event_id for update;
  else raise exception using errcode='22023',message='INVALID_EVENT_TYPE'; end if;
  if v_shop is null or not public.has_shop_role(v_shop,array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501',message='DRAW_FORBIDDEN'; end if;
  if v_status<>'active' or v_ends>now() then raise exception using errcode='22023',message='DRAW_NOT_READY'; end if;
  if p_event_type='purchase' then
    select id into v_winner from public.raffle_tickets where raffle_id=p_event_id order by gen_random_uuid() limit 1;
    if v_winner is null then raise exception using errcode='P0002',message='NO_RAFFLE_TICKETS'; end if;
    update public.purchase_raffles set status='drawing',winner_entry_id=v_winner,updated_at=now() where id=p_event_id;
  else
    select id into v_winner from public.trivia_entries where contest_id=p_event_id and is_correct order by gen_random_uuid() limit 1;
    if v_winner is null then raise exception using errcode='P0002',message='NO_CORRECT_ENTRIES'; end if;
    update public.trivia_contests set status='drawing',winner_entry_id=v_winner,updated_at=now() where id=p_event_id;
  end if;
  select * into v_stage from public.community_draw_live_stage where event_type=p_event_type and event_id=p_event_id;
  return v_stage;
end $$;

create or replace function public.complete_community_draw(p_event_type text,p_event_id uuid)
returns public.community_draw_live_stage language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_stage public.community_draw_live_stage%rowtype;
begin
  if p_event_type='purchase' then
    select shop_id into v_shop from public.purchase_raffles where id=p_event_id;
    if v_shop is null or not public.has_shop_role(v_shop,array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501',message='DRAW_FORBIDDEN'; end if;
    update public.purchase_raffles set status='completed',updated_at=now() where id=p_event_id and status='drawing';
  elsif p_event_type='trivia' then
    select shop_id into v_shop from public.trivia_contests where id=p_event_id;
    if v_shop is null or not public.has_shop_role(v_shop,array['manager','admin','supervisor']::public.shop_role[]) then raise exception using errcode='42501',message='DRAW_FORBIDDEN'; end if;
    update public.trivia_contests set status='completed',updated_at=now() where id=p_event_id and status='drawing';
  else raise exception using errcode='22023',message='INVALID_EVENT_TYPE'; end if;
  select * into v_stage from public.community_draw_live_stage where event_type=p_event_type and event_id=p_event_id;
  return v_stage;
end $$;

revoke all on function public.register_purchase_raffle_ticket(uuid,text,text,text) from public;
grant execute on function public.register_purchase_raffle_ticket(uuid,text,text,text) to anon,authenticated;
revoke all on function public.submit_trivia_entry(uuid,text,text,integer) from public;
grant execute on function public.submit_trivia_entry(uuid,text,text,integer) to anon,authenticated;
revoke all on function public.start_community_draw(text,uuid) from public;
grant execute on function public.start_community_draw(text,uuid) to authenticated;
revoke all on function public.complete_community_draw(text,uuid) from public;
grant execute on function public.complete_community_draw(text,uuid) to authenticated;

do $$ declare v_table text; begin
  foreach v_table in array array['purchase_raffles','raffle_tickets','trivia_contests','trivia_entries','community_draw_live_stage'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then execute format('alter publication supabase_realtime add table public.%I',v_table); end if;
  end loop;
end $$;

notify pgrst,'reload schema';
commit;
