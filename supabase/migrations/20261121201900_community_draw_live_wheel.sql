begin;

alter table public.community_draw_live_stage
  add column if not exists spin_started_at timestamptz,
  add column if not exists entries jsonb not null default '[]'::jsonb;

create or replace function public.sync_community_draw_live_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_phone text;
  v_code text;
  v_prize text;
  v_type text;
  v_entries jsonb := '[]'::jsonb;
  v_started_at timestamptz;
begin
  if tg_table_name = 'purchase_raffles' then
    v_type := 'purchase';
    v_prize := new.prize_name;
    select coalesce(jsonb_agg(jsonb_build_object(
      'ticket_number', t.ticket_number,
      'phone_masked', public.mask_community_phone(t.customer_phone)
    ) order by t.created_at, t.ticket_number), '[]'::jsonb)
      into v_entries
      from public.raffle_tickets t
      where t.raffle_id = new.id;

    if new.winner_entry_id is not null then
      if new.status = 'completed' then
        select t.customer_name, t.customer_phone, t.ticket_number
          into v_name, v_phone, v_code
          from public.raffle_tickets t
          where t.id = new.winner_entry_id and t.raffle_id = new.id;
      elsif new.status = 'spinning' then
        select t.ticket_number into v_code
          from public.raffle_tickets t
          where t.id = new.winner_entry_id and t.raffle_id = new.id;
      end if;
    end if;
  else
    v_type := 'trivia';
    v_prize := new.prize_title;
    select coalesce(jsonb_agg(jsonb_build_object(
      'ticket_number', e.entry_code,
      'phone_masked', public.mask_community_phone(e.customer_phone)
    ) order by e.created_at, e.entry_code), '[]'::jsonb)
      into v_entries
      from public.trivia_entries e
      where e.contest_id = new.id and e.is_correct;

    if new.winner_entry_id is not null then
      if new.status = 'completed' then
        select e.customer_name, e.customer_phone, e.entry_code
          into v_name, v_phone, v_code
          from public.trivia_entries e
          where e.id = new.winner_entry_id and e.contest_id = new.id;
      elsif new.status = 'spinning' then
        select e.entry_code into v_code
          from public.trivia_entries e
          where e.id = new.winner_entry_id and e.contest_id = new.id;
      end if;
    end if;
  end if;

  select s.spin_started_at into v_started_at
    from public.community_draw_live_stage s
    where s.event_type = v_type and s.event_id = new.id;
  if new.status = 'spinning' and v_started_at is null then
    v_started_at := clock_timestamp();
  end if;

  insert into public.community_draw_live_stage(
    shop_id, event_type, event_id, title, prize_title, ends_at, status,
    winner_name, winner_phone_masked, winner_code, spin_started_at, entries, updated_at
  ) values (
    new.shop_id, v_type, new.id, new.title, v_prize, new.ends_at, new.status,
    v_name,
    case when v_phone is null or new.status <> 'completed' then null else public.mask_community_phone(v_phone) end,
    v_code, v_started_at, v_entries, clock_timestamp()
  )
  on conflict (event_type, event_id) do update set
    title = excluded.title,
    prize_title = excluded.prize_title,
    ends_at = excluded.ends_at,
    status = excluded.status,
    winner_name = excluded.winner_name,
    winner_phone_masked = excluded.winner_phone_masked,
    winner_code = excluded.winner_code,
    spin_started_at = coalesce(excluded.spin_started_at, public.community_draw_live_stage.spin_started_at),
    entries = excluded.entries,
    updated_at = clock_timestamp();
  return new;
end;
$$;

create or replace function public.start_community_draw(p_event_type text, p_event_id uuid)
returns public.community_draw_live_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_winner uuid;
  v_status text;
  v_stage public.community_draw_live_stage%rowtype;
  v_count integer;
begin
  if p_event_type = 'purchase' then
    select shop_id, status::text into v_shop, v_status
      from public.purchase_raffles where id = p_event_id for update;
  elsif p_event_type = 'trivia' then
    select shop_id, status::text into v_shop, v_status
      from public.trivia_contests where id = p_event_id for update;
  else
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TYPE';
  end if;

  if v_shop is null or not public.has_shop_role(v_shop, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'DRAW_FORBIDDEN';
  end if;

  if v_status in ('spinning', 'completed') then
    select * into v_stage from public.community_draw_live_stage
      where event_type = p_event_type and event_id = p_event_id;
    return v_stage;
  end if;
  if v_status <> 'active' then
    raise exception using errcode = '22023', message = 'DRAW_NOT_ACTIVE';
  end if;

  if p_event_type = 'purchase' then
    select count(*)::integer into v_count from public.raffle_tickets where raffle_id = p_event_id;
    if v_count < 1 then raise exception using errcode = 'P0002', message = 'NO_RAFFLE_TICKETS'; end if;
    select id into v_winner from public.raffle_tickets
      where raffle_id = p_event_id order by gen_random_uuid() limit 1;
    update public.purchase_raffles
      set status = 'spinning', winner_entry_id = v_winner, updated_at = clock_timestamp()
      where id = p_event_id;
  else
    select count(*)::integer into v_count from public.trivia_entries
      where contest_id = p_event_id and is_correct;
    if v_count < 1 then raise exception using errcode = 'P0002', message = 'NO_CORRECT_ENTRIES'; end if;
    select id into v_winner from public.trivia_entries
      where contest_id = p_event_id and is_correct order by gen_random_uuid() limit 1;
    update public.trivia_contests
      set status = 'spinning', winner_entry_id = v_winner, updated_at = clock_timestamp()
      where id = p_event_id;
  end if;

  select * into v_stage from public.community_draw_live_stage
    where event_type = p_event_type and event_id = p_event_id;
  return v_stage;
end;
$$;

create or replace function public.complete_community_draw(p_event_type text, p_event_id uuid)
returns public.community_draw_live_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shop uuid;
  v_status text;
  v_started_at timestamptz;
  v_stage public.community_draw_live_stage%rowtype;
begin
  if p_event_type = 'purchase' then
    select shop_id, status::text into v_shop, v_status from public.purchase_raffles where id = p_event_id for update;
  elsif p_event_type = 'trivia' then
    select shop_id, status::text into v_shop, v_status from public.trivia_contests where id = p_event_id for update;
  else
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TYPE';
  end if;
  if v_shop is null or not public.has_shop_role(v_shop, array['manager','admin','supervisor']::public.shop_role[]) then
    raise exception using errcode = '42501', message = 'DRAW_FORBIDDEN';
  end if;
  if v_status = 'completed' then
    select * into v_stage from public.community_draw_live_stage where event_type = p_event_type and event_id = p_event_id;
    return v_stage;
  end if;
  if v_status <> 'spinning' then raise exception using errcode = '22023', message = 'DRAW_NOT_SPINNING'; end if;
  select spin_started_at into v_started_at from public.community_draw_live_stage
    where event_type = p_event_type and event_id = p_event_id;
  if v_started_at is null or v_started_at + interval '9 seconds' > clock_timestamp() then
    raise exception using errcode = '22023', message = 'DRAW_SPINNING';
  end if;

  if p_event_type = 'purchase' then
    update public.purchase_raffles set status = 'completed', updated_at = clock_timestamp()
      where id = p_event_id and status = 'spinning';
  else
    update public.trivia_contests set status = 'completed', updated_at = clock_timestamp()
      where id = p_event_id and status = 'spinning';
  end if;
  select * into v_stage from public.community_draw_live_stage
    where event_type = p_event_type and event_id = p_event_id;
  return v_stage;
end;
$$;

-- Safe to call from a public page: it can only reveal a winner already selected by
-- start_community_draw, and only after the server-recorded animation window elapses.
create or replace function public.finish_community_draw(p_event_type text, p_event_id uuid)
returns public.community_draw_live_stage
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.community_draw_status;
  v_started_at timestamptz;
  v_stage public.community_draw_live_stage%rowtype;
begin
  if p_event_type = 'purchase' then
    select status into v_status from public.purchase_raffles where id = p_event_id for update;
  elsif p_event_type = 'trivia' then
    select status into v_status from public.trivia_contests where id = p_event_id for update;
  else
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TYPE';
  end if;
  if not found then raise exception using errcode = 'P0002', message = 'DRAW_NOT_FOUND'; end if;
  if v_status = 'completed' then
    select * into v_stage from public.community_draw_live_stage where event_type = p_event_type and event_id = p_event_id;
    return v_stage;
  end if;
  if v_status <> 'spinning' then raise exception using errcode = '22023', message = 'DRAW_NOT_SPINNING'; end if;
  select spin_started_at into v_started_at from public.community_draw_live_stage
    where event_type = p_event_type and event_id = p_event_id;
  if v_started_at is null or v_started_at + interval '9 seconds' > clock_timestamp() then
    raise exception using errcode = '22023', message = 'DRAW_SPINNING';
  end if;

  if p_event_type = 'purchase' then
    update public.purchase_raffles set status = 'completed', updated_at = clock_timestamp()
      where id = p_event_id and status = 'spinning';
  else
    update public.trivia_contests set status = 'completed', updated_at = clock_timestamp()
      where id = p_event_id and status = 'spinning';
  end if;
  select * into v_stage from public.community_draw_live_stage
    where event_type = p_event_type and event_id = p_event_id;
  return v_stage;
end;
$$;

revoke all on function public.start_community_draw(text, uuid) from public, anon;
grant execute on function public.start_community_draw(text, uuid) to authenticated;
revoke all on function public.complete_community_draw(text, uuid) from public, anon;
grant execute on function public.complete_community_draw(text, uuid) to authenticated;
revoke all on function public.finish_community_draw(text, uuid) from public;
grant execute on function public.finish_community_draw(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
