BEGIN;

ALTER TABLE public.catalog_orders
  DROP CONSTRAINT IF EXISTS catalog_orders_status_check;

ALTER TABLE public.catalog_orders
  ADD CONSTRAINT catalog_orders_status_check
  CHECK (status IN (
    'pending', 'new', 'contacted', 'confirmed', 'accepted', 'approved', 'preparing', 'ready',
    'delivered', 'completed', 'cancelled', 'canceled',
    'جديد', 'قيد الانتظار', 'تم التواصل', 'مؤكد', 'تم القبول',
    'جاري التجهيز', 'جارٍ التجهيز', 'جاهز', 'جاهز للاستلام',
    'تم التسليم', 'مكتمل', 'ملغي', 'ملغى'
  ));

ALTER TABLE public.catalog_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_orders FORCE ROW LEVEL SECURITY;
REVOKE SELECT, UPDATE ON TABLE public.catalog_orders FROM anon, PUBLIC;
GRANT SELECT, UPDATE ON TABLE public.catalog_orders TO authenticated;

DROP POLICY IF EXISTS catalog_orders_manager_read ON public.catalog_orders;
CREATE POLICY catalog_orders_manager_read
  ON public.catalog_orders
  FOR SELECT
  TO authenticated
  USING (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

DROP POLICY IF EXISTS catalog_orders_manager_update ON public.catalog_orders;
CREATE POLICY catalog_orders_manager_update
  ON public.catalog_orders
  FOR UPDATE
  TO authenticated
  USING (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]))
  WITH CHECK (public.has_shop_role(shop_id, array['manager','admin','supervisor']::public.shop_role[]));

NOTIFY pgrst, 'reload schema';

COMMIT;
