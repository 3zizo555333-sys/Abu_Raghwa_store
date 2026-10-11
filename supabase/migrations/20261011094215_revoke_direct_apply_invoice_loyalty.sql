begin;

-- This routine mutates invoice/customer loyalty state and must only run inside
-- complete_invoice_intent, not as a separate authenticated RPC call.
revoke all on function public.apply_invoice_loyalty(uuid, uuid, text, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
