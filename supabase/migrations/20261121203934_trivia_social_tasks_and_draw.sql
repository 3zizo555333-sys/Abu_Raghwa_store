begin;

alter table public.trivia_contests
  add column if not exists rules jsonb not null default '{}'::jsonb;

alter table public.trivia_entries
  add column if not exists social_tasks_completed jsonb not null default '{}'::jsonb;

create or replace view public.public_trivia_contests with (security_barrier=true) as
  select id, shop_id, title, question, question_image_url, options, prize_title,
         prize_image_url, banner_image_url, ends_at, status, created_at, rules
  from public.trivia_contests
  where status in ('active', 'drawing', 'spinning', 'completed');

grant select on public.public_trivia_contests to anon, authenticated;

create or replace function public.submit_trivia_entry(
  p_contest_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_selected_option integer,
  p_social_tasks_completed jsonb
)
returns table(entry_id uuid, entry_code text, is_correct boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contest public.trivia_contests%rowtype;
  v_phone text;
  v_code text;
  v_correct boolean;
  v_id uuid;
  v_tasks jsonb;
  v_completed jsonb;
begin
  v_phone := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_completed := coalesce(p_social_tasks_completed, '{}'::jsonb);
  if length(trim(coalesce(p_customer_name, ''))) not between 1 and 120
     or length(v_phone) not between 7 and 15
     or jsonb_typeof(v_completed) <> 'object' then
    raise exception using errcode = '22023', message = 'INVALID_CUSTOMER_OR_SOCIAL_TASKS';
  end if;

  select * into v_contest
  from public.trivia_contests
  where id = p_contest_id and status = 'active'
  for update;
  if not found or v_contest.ends_at <= now() then
    raise exception using errcode = 'P0002', message = 'CONTEST_NOT_ACTIVE';
  end if;
  if p_selected_option is null
     or p_selected_option < 0
     or p_selected_option >= jsonb_array_length(v_contest.options) then
    raise exception using errcode = '22023', message = 'INVALID_OPTION';
  end if;

  v_tasks := coalesce(v_contest.rules -> 'social_tasks', '{}'::jsonb);
  if (v_tasks ->> 'requireFacebookShare') = 'true'
     and nullif(trim(v_tasks ->> 'facebookPageUrl'), '') is not null
     and v_completed ->> 'facebookPageUrl' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'SOCIAL_TASKS_REQUIRED';
  end if;
  if (v_tasks ->> 'requireFacebookShare') = 'true'
     and nullif(trim(v_tasks ->> 'facebookPostUrl'), '') is not null
     and v_completed ->> 'facebookPostUrl' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'SOCIAL_TASKS_REQUIRED';
  end if;
  if (v_tasks ->> 'requireWhatsappShare') = 'true'
     and v_completed ->> 'whatsappShare' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'SOCIAL_TASKS_REQUIRED';
  end if;
  if (v_tasks ->> 'requireInstagramFollow') = 'true'
     and nullif(trim(v_tasks ->> 'instagramUrl'), '') is not null
     and v_completed ->> 'instagramUrl' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'SOCIAL_TASKS_REQUIRED';
  end if;
  if (v_tasks ->> 'requireTiktokFollow') = 'true'
     and nullif(trim(v_tasks ->> 'tiktokUrl'), '') is not null
     and v_completed ->> 'tiktokUrl' is distinct from 'true' then
    raise exception using errcode = '22023', message = 'SOCIAL_TASKS_REQUIRED';
  end if;

  v_correct := p_selected_option = v_contest.correct_option_index;
  v_code := '#Q-' || nextval('public.trivia_entry_number_seq')::text;
  insert into public.trivia_entries(
    shop_id, contest_id, customer_name, customer_phone, selected_option,
    is_correct, entry_code, social_tasks_completed
  ) values (
    v_contest.shop_id, v_contest.id, trim(p_customer_name), v_phone,
    p_selected_option, v_correct, v_code, v_completed
  ) returning id into v_id;

  return query select v_id, v_code, v_correct;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'PHONE_ALREADY_ENTERED';
end;
$$;

-- Keep existing clients on the safe path: an old four-argument call passes no completions
-- and is rejected whenever the contest has required social tasks.
create or replace function public.submit_trivia_entry(
  p_contest_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_selected_option integer
)
returns table(entry_id uuid, entry_code text, is_correct boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select * from public.submit_trivia_entry(
    p_contest_id, p_customer_name, p_customer_phone, p_selected_option, '{}'::jsonb
  );
end;
$$;

revoke all on function public.submit_trivia_entry(uuid, text, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.submit_trivia_entry(uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.submit_trivia_entry(uuid, text, text, integer, jsonb) to anon, authenticated;
grant execute on function public.submit_trivia_entry(uuid, text, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
