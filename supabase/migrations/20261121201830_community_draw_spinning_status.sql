begin;

alter type public.community_draw_status add value if not exists 'spinning';

commit;
