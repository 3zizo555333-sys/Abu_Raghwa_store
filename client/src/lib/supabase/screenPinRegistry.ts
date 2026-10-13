export interface ScreenPinFeature {
  key: string;
  path: string;
  title: string;
  description: string;
}

/**
 * Every internal staff route has its own stable lock key and its own PIN hash.
 * Customer-facing routes, authentication, and this security console stay outside
 * the staff PIN gate so public ordering and account recovery remain available.
 */
const INTERNAL_SCREEN_ROUTES = [
  ["/", "لوحة المتجر الرئيسية", "ملخص المتجر والتنقل الرئيسي."],
  ["/home", "الرئيسية", "واجهة الموظفين الرئيسية."],
  ["/dashboard", "لوحة التحكم", "لوحة مؤشرات المتجر."],
  ["/products", "المنتجات", "إدارة المنتجات ومعلومات المخزون."],
  ["/sales", "البيع السريع", "تسجيل المبيعات ونقطة البيع."],
  ["/cashier", "كاشير الصب والبيع", "شاشة الكاشير وسجل التركيبات الفورية."],
  ["/reports", "التقارير المالية", "التقارير المالية والأرباح."],
  ["/advanced-reports", "جرد المبيعات والأرباح", "تحليل وجرد المبيعات."],
  ["/employees", "إدارة الموظفين", "ملفات الموظفين والنقاط والأدوار."],
  ["/tasks", "المهام", "إنشاء ومتابعة مهام فريق العمل."],
  ["/points-system", "نظام النقاط", "إعداد نقاط العملاء ومبيعات الموظفين."],
  ["/offers", "العروض", "إدارة عروض المتجر."],
  ["/smart-offers", "العروض الذكية", "إنشاء استراتيجيات العروض الذكية."],
  ["/smart-offers-list", "قائمة العروض الذكية", "مراجعة ونشر العروض الذكية."],
  ["/catalog-manager", "إدارة الكتالوج", "إدارة قائمة الأسعار وظهورها للعملاء."],
  ["/voice", "المساعد الصوتي", "أوامر المساعد الصوتي."],
  ["/materials", "الخامات", "إدارة خامات العطور ومكوناتها."],
  ["/recipes", "التركيبات", "إدارة التركيبات وتكاليفها."],
  ["/calculator", "الحاسبة", "حاسبة المتجر التشغيلية."],
  ["/invoice-ocr", "قراءة فواتير OCR", "استخراج بيانات الفواتير والخامات."],
  ["/invoice", "الفواتير", "عرض وإدارة الفواتير."],
  ["/returns", "المرتجعات", "إدارة مرتجعات المبيعات."],
  ["/audit-log", "سجل التدقيق", "مراجعة التغييرات والأحداث."],
  ["/inventory-alerts", "تنبيهات المخزون", "تنبيهات مستويات المخزون."],
  ["/recipe-production", "إنتاج التركيبات", "تنفيذ ومتابعة إنتاج التركيبات."],
  ["/data-export-import", "النسخ الاحتياطي والاستيراد والتصدير", "إدارة نسخ البيانات واستيرادها وتصديرها."],
  ["/recipes-display", "عرض التركيبات", "شاشة عرض التركيبات."],
  ["/advanced-search", "البحث المتقدم", "بحث متقدم في بيانات المتجر."],
  ["/settings", "إعدادات المتجر", "الإعدادات العامة وإعدادات الطباعة."],
  ["/email-notifications", "إعدادات الإشعارات", "تهيئة إشعارات المتجر."],
  ["/payment-gateway", "إعدادات الدفع", "إعداد بوابة الدفع."],
  ["/user-management", "إدارة العضويات", "أدوار أعضاء المتجر وحالة عضويتهم."],
  ["/expenses", "المصاريف اليومية", "تسجيل المصروفات وإيصالاتها."],
  ["/checks", "الشيكات", "إدارة الشيكات."],
  ["/checks-page", "سجل الشيكات", "سجل الشيكات وحالاتها."],
  ["/suppliers", "الموردون", "إدارة الموردين وحساباتهم."],
  ["/tasks-page", "متابعة المهام", "متابعة إنجاز مهام الموظفين."],
  ["/inventory", "إدارة المخزون", "حركة المنتجات ومخزون المتجر."],
  ["/material-details/:id", "تفاصيل الخامة", "تفاصيل الخامة ومكوناتها."],
  ["/invoice-camera", "تصوير الفواتير", "تصوير الفواتير وربطها بالموردين."],
  ["/invoice-scanner", "ماسح الفواتير", "مسح الفواتير وأرشفتها."],
  ["/advanced-invoices", "أرشيف الفواتير المتقدم", "بحث ومراجعة أرشيف الفواتير."],
  ["/advanced-barcode", "الباركود المتقدم", "إدارة البحث والباركود."],
  ["/social-media", "التواصل الاجتماعي", "أدوات التواصل الاجتماعي."],
  ["/voice-control", "التحكم الصوتي", "إعداد وتشغيل التحكم الصوتي."],
  ["/notifications", "الإشعارات", "إشعارات المتجر."],
  ["/notifications-advanced", "الإشعارات المتقدمة", "إدارة الإشعارات المتقدمة."],
  ["/apartment-management", "إدارة الشقة", "مخزون ومتابعة الشقة."],
  ["/leaderboard", "لوحة الشرف", "لوحة نقاط العملاء والموظفين."],
  ["/credits-suppliers", "الآجل وحسابات الموردين", "حسابات الآجل والديون وحركات السداد."],
  ["/shortages", "نواقص أبو رغوة", "تنبيهات نقص المخزون ومتابعتها."],
] as const;

export function screenPinKeyForPath(path: string): string {
  const slug = path
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "root";
  return `screen__${slug}`;
}

export const SCREEN_PIN_LOCKS: readonly ScreenPinFeature[] = INTERNAL_SCREEN_ROUTES.map(([path, title, description]) => ({
  key: screenPinKeyForPath(path),
  path,
  title,
  description,
}));

export const SCREEN_PIN_LOCK_KEYS = SCREEN_PIN_LOCKS.map(feature => feature.key);
