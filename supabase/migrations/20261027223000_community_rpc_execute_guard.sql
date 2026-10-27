begin;
revoke all on function public.start_community_draw(text,uuid) from public, anon;
grant execute on function public.start_community_draw(text,uuid) to authenticated;
revoke all on function public.complete_community_draw(text,uuid) from public, anon;
grant execute on function public.complete_community_draw(text,uuid) to authenticated;
-- Customer entry RPCs remain public, but only the server-side validators may insert entries.
revoke all on function public.register_purchase_raffle_ticket(uuid,text,text,text) from public;
grant execute on function public.register_purchase_raffle_ticket(uuid,text,text,text) to anon, authenticated;
revoke all on function public.submit_trivia_entry(uuid,text,text,integer) from public;
grant execute on function public.submit_trivia_entry(uuid,text,text,integer) to anon, authenticated;
commit;
