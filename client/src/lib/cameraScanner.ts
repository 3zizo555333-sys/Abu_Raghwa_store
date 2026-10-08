export function getCameraConstraintAttempts(): MediaStreamConstraints[] {
  return [
    { video: { facingMode: { exact: "environment" }, width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 } }, audio: false },
    { video: { facingMode: { ideal: "environment" }, width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 } }, audio: false },
    { video: { width: { ideal: 640, max: 960 }, height: { ideal: 480, max: 720 } }, audio: false },
  ];
}

export function getCameraErrorMessage(error: unknown): string {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  const message = typeof error === "object" && error && "message" in error ? String(error.message).toLowerCase() : "";
  if (name === "NotAllowedError" || /permission denied|permission dismissed|user denied/.test(message)) return "رفض المتصفح إذن الكاميرا. افتح الرابط في Chrome مباشرةً (وليس داخل معاينة أو تطبيق وسيط)، ثم من إعدادات الموقع > الكاميرا اختر «سماح» وأعد تحميل الصفحة. إذا كانت صلاحية Chrome للهاتف مرفوضة، فعّلها من إعدادات الهاتف > التطبيقات > Chrome > الأذونات > الكاميرا.";
  if (name === "SecurityError") return "المعاينة أو التطبيق الذي فتح الرابط يمنع الوصول للكاميرا. افتح الرابط في Chrome مباشرةً ثم اسمح للكاميرا من إعدادات الموقع.";
  if (name === "NotFoundError") return "لم يتم العثور على كاميرا متاحة على جهازك. استخدم الإدخال اليدوي للباركود.";
  if (name === "NotReadableError" || name === "AbortError") return "الكاميرا مشغولة بتطبيق آخر. اقفل كاميرا الهاتف أو واتساب ثم أعد المحاولة، أو استخدم تصوير كاميرا الهاتف.";
  if (name === "OverconstrainedError") return "لا يدعم الهاتف إعداد الكاميرا المباشرة. استخدم تصوير كاميرا الهاتف أو الإدخال اليدوي.";
  return "تعذر تشغيل الكاميرا المباشرة الآن. استخدم تصوير كاميرا الهاتف؛ سيُقرأ الباركود من الصورة تلقائيًا.";
}

export function isExpectedCameraAccessError(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  const message = typeof error === "object" && error && "message" in error ? String(error.message).toLowerCase() : "";
  return name === "NotAllowedError" || name === "SecurityError" || name === "NotReadableError" || name === "AbortError" || name === "OverconstrainedError" || /permission denied|permission dismissed|user denied/.test(message);
}
