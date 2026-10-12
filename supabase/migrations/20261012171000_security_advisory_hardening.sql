begin;

-- These ledgers are internal to their SECURITY DEFINER RPCs. Keep all direct
-- client grants revoked; policies below are defense-in-depth for any future
-- grants and do not change the checkout or bulk-insert RPC paths.
alter table public.invoice_intents enable row level security;
alter table public.apartment_inventory_bulk_requests enable row level security;
revoke all on table public.invoice_intents, public.apartment_inventory_bulk_requests
  from public, anon, authenticated;

-- A signed-in cashier/member may only read their own intent within a shop they
-- belong to. Direct writes stay denied: creation/completion/cancellation must
-- continue through validated, idempotent RPCs.
drop policy if exists invoice_intents_actor_read on public.invoice_intents;
create policy invoice_intents_actor_read
  on public.invoice_intents for select to authenticated
  using (
    actor_id = (select auth.uid())
    and (select public.is_shop_member(shop_id))
  );
drop policy if exists invoice_intents_direct_write_block on public.invoice_intents;
create policy invoice_intents_direct_write_block
  on public.invoice_intents for all to authenticated
  using (false)
  with check (false);

-- Bulk request receipts may be inspected only by authorized shop managers.
-- Inserts and updates remain exclusively inside the atomic bulk RPC.
drop policy if exists apartment_inventory_bulk_requests_manager_read on public.apartment_inventory_bulk_requests;
create policy apartment_inventory_bulk_requests_manager_read
  on public.apartment_inventory_bulk_requests for select to authenticated
  using (
    (select public.has_shop_role(
      shop_id,
      array['manager','admin','supervisor']::public.shop_role[]
    ))
  );
drop policy if exists apartment_inventory_bulk_requests_direct_write_block on public.apartment_inventory_bulk_requests;
create policy apartment_inventory_bulk_requests_direct_write_block
  on public.apartment_inventory_bulk_requests for all to authenticated
  using (false)
  with check (false);

-- SECURITY DEFINER functions intentionally keep an empty search_path and use
-- schema-qualified references. Do not broaden it to public/auth: the empty
-- path is the safer configuration and is already validated in CI.

notify pgrst, 'reload schema';
commit;
