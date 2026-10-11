import html2canvas from "html2canvas";

/** يبني اسماً آمناً لملف صورة الفاتورة دون تمرير رموز قد تمنع الحفظ في الهاتف. */
export const buildInvoiceImageFilename = (invoiceId?: string) => {
  const safeId = String(invoiceId || "abu-raghwa")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "abu-raghwa";

  return `Invoice-${safeId}.png`;
};

/** يلتقط عنصر الفاتورة إلى PNG بعد تجهيز الخطوط وإزالة تحجيم المعاينة من النسخة الملتقطة. */
export async function captureInvoicePng(element: HTMLElement): Promise<Blob> {
  if (!element) throw new Error("تعذر العثور على عنصر الفاتورة.");

  try {
    if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) throw new Error("عنصر الفاتورة غير ظاهر أو بلا أبعاد.");

    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale: Math.min(3, Math.max(1, window.devicePixelRatio || 1)),
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      onclone: clonedDocument => {
        const content = clonedDocument.querySelector<HTMLElement>("[data-invoice-export-content]");
        content?.style.removeProperty("transform");
        content?.style.removeProperty("transform-origin");
      },
    });

    if (canvas.width <= 0 || canvas.height <= 0) throw new Error("التقط المتصفح مساحة صورة فارغة.");
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob(resolve, "image/png");
      } catch (error) {
        reject(error);
      }
    });
    if (!blob || blob.size === 0) throw new Error("تعذر إنشاء ملف PNG من الفاتورة.");
    return blob;
  } catch (error) {
    if (error instanceof Error && /^(تعذر|عنصر الفاتورة|التقط المتصفح)/.test(error.message)) throw error;
    const details = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`تعذر التقاط صورة الفاتورة.${details}`);
  }
}

/** ينزّل Blob مباشرة مع تأخير تحرير عنوانه حتى يكتمل بدء التنزيل في متصفحات الهاتف. */
export const downloadImageBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  try {
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    link.remove();
    throw error;
  }
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
};

export type InvoiceShareResult = "shared" | "downloaded" | "cancelled";

/** يشارك ملف PNG نفسه، ويحوّل عدم الدعم أو فشل المشاركة إلى تنزيل تلقائي. */
export async function shareInvoicePng(
  blob: Blob,
  filename: string,
  title: string,
  download: (image: Blob, fileName: string) => void = downloadImageBlob,
): Promise<InvoiceShareResult> {
  const fallback = () => {
    download(blob, filename);
    return "downloaded" as const;
  };

  if (!blob || blob.size === 0 || typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File === "undefined") {
    return fallback();
  }

  let file: File;
  try {
    file = new File([blob], filename, { type: "image/png" });
  } catch {
    return fallback();
  }
  const data: ShareData = { title, files: [file] };
  if (typeof navigator.canShare === "function") {
    try {
      if (!navigator.canShare(data)) return fallback();
    } catch {
      return fallback();
    }
  }
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") return "cancelled";
    return fallback();
  }
}

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
