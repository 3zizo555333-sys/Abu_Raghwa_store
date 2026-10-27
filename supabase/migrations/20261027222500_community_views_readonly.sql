begin;
revoke all privileges on public.public_purchase_raffles, public.public_trivia_contests from public, anon, authenticated;
grant select on public.public_purchase_raffles, public.public_trivia_contests to anon, authenticated;
notify pgrst,'reload schema';
commit;
