/** يبني اسماً آمناً لملف صورة الفاتورة دون تمرير رموز قد تمنع الحفظ في الهاتف. */
export const buildInvoiceImageFilename = (invoiceId?: string) => {
  const safeId = String(invoiceId || "abu-raghwa")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "abu-raghwa";

  return `Invoice-${safeId}.png`;
};

/** ينفّذ تنزيل Blob بصورة متوافقة مع متصفحات الهاتف الحديثة. */
export const downloadImageBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
};

/** يفتح الصورة في نافذة مستقلة إذا منع الهاتف التنزيل المباشر، ليتم حفظها بالضغط المطول. */
export const openImageForManualSave = (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10 * 60 * 1_000);
};
