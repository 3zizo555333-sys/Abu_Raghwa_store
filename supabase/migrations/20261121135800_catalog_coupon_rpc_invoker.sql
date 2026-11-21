begin;

-- Public coupon RPCs rely on their table grants and active-coupon RLS policy;
-- they must not bypass row-level security as SECURITY DEFINER functions.
alter function public.validate_catalog_coupon(uuid, text, numeric) security invoker;

commit;
