# Project Handover — Abu Raghwa Store

**آخر تحديث:** 2026-10-11  
**المستودع:** `3zizo555333-sys/Abu_Raghwa_store`  
**الفرع الرئيسي:** `main`  
**فرع الترحيل:** `feat/supabase-cloud-migration`  
**آخر Merge Commit على main:** `ddb0180f81de70b755d948cc52cdff9bccaae83e`

## 1. الحالة الحالية

المشروع يعمل على ترحيل تدريجي من Web Storage إلى Supabase. تم دفع التعديلات ودمجها في GitHub، ويجب اعتبار `origin/main` هو المصدر المرجعي قبل بدء أي عمل جديد.

### ما تم إنجازه

- إنشاء مخطط Supabase للتخزين السحابي مع RLS وRealtime وTriggers.
- ترحيل التقارير، الولاء، الهدايا، الكتالوج، الموظفين، الحضور، الخامات، الإنتاج وإعدادات الكتالوج.
- إزالة الاعتماد المباشر على Web Storage من مسارات التطبيق؛ كاشف Web Storage وصل إلى صفر إحالات مباشرة.
- ربط صفحات التقارير، Dashboard، الولاء، الموظفين، الإنتاج والكتالوج بطبقات Supabase.
- دعم Pagination خادمي للمنتجات، وChunking لعمليات الإدخال والحذف المجمعة مع شريط تقدم ومزامنة صارمة غير متفائلة.
- إصلاح سياسات RLS للمنتجات والباركودات، خصوصاً صلاحيات المالك والمشرفين المنتمين إلى نفس المتجر.
- إصلاح RPC الخاصة باستعادة `invoice_intents` ومسار الكاشير والبيع العادي.
- إصلاح Trigger الأحداث الذي كان يحاول قراءة `deleted_at` من جداول لا تحتوي هذا الحقل.
- إضافة تغذية مرئية/حسية/صوتية عند نجاح مسح الباركود.
- إضافة شاشة Customer Display مع انتقالات سلسة وRealtime.
- إضافة المسار العام `/led-display` للعروض المتحركة.
- إضافة طبقة Web Serial/WebUSB للميزان مع ربط الوزن بالسلة عند توفر دعم المتصفح والجهاز.
- إضافة نظام المرتجعات الذري، إعادة المخزون، سجل نقاط الولاء، وخصم النقاط تلقائياً عند المرتجع.
- تحويل مشاركة وتنزيل الفاتورة إلى صورة PNG من عنصر الفاتورة، مع دعم `navigator.share()` وFallback للتنزيل.
- إضافة أسعار متعددة حسب نوع البيع:
  - قطاعي: `retail_price` و`retail_loyalty_points`
  - تجزئة: `wholesale_retail_price` و`sub_wholesale_loyalty_points`
  - جملة: `bulk_price` و`wholesale_loyalty_points`
- إضافة اختيار نوع البيع في الكاشير، وإعادة تسعير السلة وحساب النقاط حسب النوع المختار.
- جعل الخادم هو المصدر النهائي للسعر والنقاط داخل RPC الفاتورة، مع حفظ Snapshot للنقاط في بنود الفاتورة.

## 2. تحذيرات حرجة للمطور القادم

### RLS

لا تقم بتعطيل RLS أو إضافة سياسات عامة واسعة مثل `using (true)` أو `with check (true)` دون فهم نموذج المتجر. الوصول التجاري يجب أن يمر عبر دوال العضوية الحالية، ومنها:

- `is_shop_member(...)`
- `has_shop_role(...)`

يجب أن تكون سياسات القراءة والكتابة مقيدة بـ `shop_id` وبالعضوية النشطة ودور المستخدم.

### Triggers و`deleted_at`

تم إصلاح خطأ حرج كان يظهر كالتالي:

```text
record "old" has no field "deleted_at"
```

لا تعدّل `emit_shop_change_event` أو أي Trigger يعتمد على أعمدة الصفوف من دون التأكد من أن العمود موجود في كل الجداول المرتبطة. جداول الفواتير وبعض جداول الأحداث لا تحتوي بالضرورة على `deleted_at`.

Migration الإصلاح ذات الصلة:

```text
supabase/migrations/20261011093000_fix_cashier_event_trigger.sql
```

### مسار `invoice_intents`

مسار الكاشير يعتمد على دورة ذرية آمنة:

1. إنشاء/استعادة `invoice_intent`.
2. تشغيل `complete_invoice_intent`.
3. إنشاء الفاتورة وتحديث المخزون والنقاط داخل RPCs.
4. تأكيد الاستلام بواسطة `acknowledge_invoice_intent`.

لا تستبدل هذا المسار بحفظ مباشر من الواجهة، ولا تفرغ السلة أو تعرض نجاحاً قبل رد الخادم. لا تحذف أو تعيد تسمية:

- `get_recoverable_invoice_intent`
- `create_invoice_intent`
- `complete_invoice_intent`
- `acknowledge_invoice_intent`
- `cancel_pending_invoice_intent`

### المرتجعات والدفتر المالي

سجلات `loyalty_point_ledger` وسجلات المرتجعات غير قابلة للتعديل المباشر. استخدم RPC المرتجعات الذري فقط. لا تعدّل نقاط العميل يدوياً من الواجهة ولا تحذف قيود الدفتر.

### الأسعار والنقاط

لا تعتمد على السعر الذي ترسله الواجهة كحقيقة نهائية. الواجهة ترسل نوع البيع، والخادم يقرأ السعر من `products` ويثبت السعر داخل `invoice_items`. أي تعديل على الأسعار أو النقاط يجب أن يحافظ على هذا السلوك.

## 3. الملفات المهمة

- `supabase/migrations/20261008044614_cloud_store_initial.sql` — المخطط الأساسي والدوال الأمنية.
- `supabase/migrations/20261008095016_invoice_intents.sql` — مسار نوايا الفواتير.
- `supabase/migrations/20261011101500_loyalty_returns.sql` — المرتجعات ودفتر نقاط الولاء.
- `supabase/migrations/20261011103000_tiered_pricing_loyalty.sql` — الأسعار والنقاط حسب نوع البيع.
- `supabase/migrations/20261011093000_fix_cashier_event_trigger.sql` — إصلاح Trigger `deleted_at`.
- `client/src/lib/supabase/invoices.ts` — خدمات الفواتير والمرتجعات.
- `client/src/lib/supabase/products.ts` — CRUD المنتجات والـPagination.
- `client/src/pages/Cashier.tsx` — الكاشير ونوع البيع والماسح.
- `client/src/pages/Products.tsx` — نموذج المنتجات والأسعار والنقاط.
- `client/src/lib/supabase/database.types.ts` — الأنواع المطابقة للمخطط.
- `HANDOVER.md` — سجل الترحيل السابق.
- `docs/reports-loyalty-import-plan.md` — خطة الاستيراد الآمن.

## 4. الميزات التي كانت مطلوبة لاحقاً

تم تنفيذ الميزتين المذكورتين في خطة التسليم السابقة بالفعل:

- **تحويل الفاتورة إلى صورة ومشاركتها:** منفذ في `Invoice.tsx` باستخدام `html2canvas` مع تنزيل ومشاركة الملف.
- **ثلاثة أسعار وثلاثة مستويات نقاط لكل منتج وربطها بالكاشير:** منفذة في migration `20261011103000_tiered_pricing_loyalty.sql` وفي `Products.tsx` و`Cashier.tsx`.

أي تحسينات لاحقة يجب أن تبدأ من `origin/main` وتتحقق أولاً من عدم إعادة إدخال Web Storage أو كسر دورة الفاتورة الذرية.

## 5. التحقق قبل أي تعديل جديد

شغّل الفحوصات المحدودة التالية بعد التعديل:

```bash
pnpm check
pnpm supabase:check-sql
node scripts/check-web-storage.mjs --strict
git diff --check
```

اختبارات مسارات الكاشير والفواتير والمنتجات:

```bash
pnpm exec vitest run \
  server/cashier-display.test.ts \
  client/src/lib/supabase/invoices.test.ts \
  client/src/lib/supabase/products.test.ts \
  client/src/lib/supabase/products.barcode.test.ts
```

## 6. سياسة النسخ والنشر

- لا تعمل مباشرة على `main` عند تطوير ميزة جديدة؛ أنشئ فرعاً منفصلاً وPull Request.
- لا تطبق Migration على Supabase الحية قبل مراجعة أنها لا تحتوي `delete` أو `truncate` أو إعادة ضبط للبيانات.
- بعد أي Migration، نفّذ `notify pgrst, 'reload schema'` عند الحاجة إلى تحديث PostgREST.
- احتفظ بملفات Migration غير قابلة للتعديل بعد نشرها؛ أضف Migration تصحيحية جديدة بدلاً من إعادة كتابة التاريخ.
