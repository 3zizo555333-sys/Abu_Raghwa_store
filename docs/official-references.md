# مراجع المنصات الرسمية

تمت مراجعة الصفحات التالية في 8 أكتوبر 2026 عند تجهيز مخطط الترحيل:

- Supabase SSR clients & cookies: https://supabase.com/docs/guides/auth/server-side/creating-a-client
  - الدليل الرسمي يستخدم `@supabase/ssr` مع `@supabase/supabase-js`، وعميلًا للمتصفح وآخر للخادم؛ مع Proxy/Middleware لتجديد الجلسة في تطبيقات Next.js.
- Supabase Realtime Postgres Changes: https://supabase.com/docs/guides/realtime/postgres-changes
  - يوصي الدليل بإضافة الجداول المطلوبة إلى `supabase_realtime`، واستخدام RLS وفلاتر تضبط نطاق الأحداث. حذف الصفوف له قيود مع RLS، لذلك تعتمد هذه البنية حذفًا منطقيًا للأصناف وأحداث تغيير محدودة بالمعرّف والإصدار بدل نشر الصفوف كاملة.
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
  - التحميل والقراءة عبر سياسات RLS على `storage.objects`; مفاتيح الخدمة تتجاوز RLS ويجب أن تبقى على خادم موثوق فقط.
- Vercel Vite: https://vercel.com/docs/frameworks/frontend/vite
  - يدعم Vite كملفات ثابتة وFunctions تحت `/api`; يحتاج SPA إلى rewrite للمسارات العميقة، وتحتاج واجهة Vite إلى متغيرات عامة ذات بادئة `VITE_` وقت البناء.
- Supabase database testing: https://supabase.com/docs/guides/database/testing
  - يستخدم `supabase test db` ملفات SQL/pgTAP ضمن `supabase/tests`.
- Supabase CI testing: https://supabase.com/docs/guides/deployment/ci/testing
  - يشغّل Supabase CLI محليًا في GitHub Actions قبل اختبارات قاعدة البيانات.
- Supabase setup-cli GitHub Action: https://github.com/supabase/setup-cli
  - تثبيت CLI عبر `supabase/setup-cli@v3` وتشغيل `supabase start` و`supabase test db`.
