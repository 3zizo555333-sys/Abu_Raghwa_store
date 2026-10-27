begin;
-- Public event feeds are scoped to Abu Raghwa; staff policies remain shop-role scoped.
drop policy if exists community_draw_stage_public_read on public.community_draw_live_stage;
create policy community_draw_stage_public_read on public.community_draw_live_stage for select to anon,authenticated using (shop_id='0d51b750-6e5d-4396-90c3-51d44bf3449b'::uuid);

grant select on public.community_draw_live_stage to anon,authenticated;

create or replace view public.public_purchase_raffles with (security_barrier=true) as
 select id,shop_id,title,description,banner_image_url,prize_name,prize_image_url,prize_description,required_products_rules,min_invoice_total,ends_at,status,created_at
 from public.purchase_raffles
 where shop_id='0d51b750-6e5d-4396-90c3-51d44bf3449b'::uuid and status in ('active','drawing','completed');

create or replace view public.public_trivia_contests with (security_barrier=true) as
 select id,shop_id,title,question,options,prize_title,prize_image_url,ends_at,status,created_at
 from public.trivia_contests
 where shop_id='0d51b750-6e5d-4396-90c3-51d44bf3449b'::uuid and status in ('active','drawing','completed');

grant select on public.public_purchase_raffles,public.public_trivia_contests to anon,authenticated;
notify pgrst,'reload schema';
commit;
