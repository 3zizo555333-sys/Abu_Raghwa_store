begin;

create table if not exists public.user_quick_shortcuts (
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id uuid not null references public.shops(id) on delete cascade,
  shortcut_paths jsonb not null default '[]'::jsonb check (jsonb_typeof(shortcut_paths) = 'array'),
  updated_at timestamptz not null default now(),
  primary key (user_id, store_id)
);

alter table public.user_quick_shortcuts enable row level security;
alter table public.user_quick_shortcuts force row level security;
revoke all on public.user_quick_shortcuts from public, anon;
grant select, insert, update, delete on public.user_quick_shortcuts to authenticated;

drop policy if exists user_quick_shortcuts_select on public.user_quick_shortcuts;
drop policy if exists user_quick_shortcuts_insert on public.user_quick_shortcuts;
drop policy if exists user_quick_shortcuts_update on public.user_quick_shortcuts;
drop policy if exists user_quick_shortcuts_delete on public.user_quick_shortcuts;
create policy user_quick_shortcuts_select on public.user_quick_shortcuts for select to authenticated
  using (user_id = auth.uid() and public.is_shop_member(store_id));
create policy user_quick_shortcuts_insert on public.user_quick_shortcuts for insert to authenticated
  with check (user_id = auth.uid() and public.is_shop_member(store_id));
create policy user_quick_shortcuts_update on public.user_quick_shortcuts for update to authenticated
  using (user_id = auth.uid() and public.is_shop_member(store_id))
  with check (user_id = auth.uid() and public.is_shop_member(store_id));
create policy user_quick_shortcuts_delete on public.user_quick_shortcuts for delete to authenticated
  using (user_id = auth.uid() and public.is_shop_member(store_id));

create trigger user_quick_shortcuts_touch_updated_at before update on public.user_quick_shortcuts
  for each row execute function public.touch_updated_at();

notify pgrst, 'reload schema';
commit;
