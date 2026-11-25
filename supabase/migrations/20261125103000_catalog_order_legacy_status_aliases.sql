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

NOTIFY pgrst, 'reload schema';

COMMIT;
