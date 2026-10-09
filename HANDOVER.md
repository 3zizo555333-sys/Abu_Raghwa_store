# HANDOVER

**الدفعة 1:** حُذفت أربع وحدات غير مستخدمة فعليًا (`AdvancedReports.tsx` و`CreditPage.tsx` و`useSalesCloudState.ts` و`InvoiceCamera.tsx`) وأزيل استيراد الكاميرا القديم من `App.tsx`؛ لم تُمسّ المسارات الفعالة.

فحص `pnpm storage:strict` انخفض من 138 إحالة في 27 ملفًا إلى **122 إحالة في 23 ملفًا**. نجح `pnpm check` و`pnpm build`؛ بقي تحذير حجم الحزم. هذه الدفعة أزالت شيفرة يتيمة فقط، ولم ترحّل الملفات النشطة المتبقية. ما زال `cloudSync` يعتمد على snapshots/tRPC، كما أن تطبيق/اختبار migrations الحية واستيراد بيانات الأعمال لم يكتمل؛ لا تدمج أو تنشر Production قبل إغلاق ذلك.