const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1_800_000;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

/** Resize and compress invoice photos in the browser while retaining legible receipt text. */
export async function prepareSupplierInvoiceImage(file: File): Promise<File> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.");
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("حجم الصورة الأصلية يجب ألا يتجاوز 20 ميجابايت.");
  if (typeof createImageBitmap !== "function") throw new Error("المتصفح لا يدعم ضغط الصور؛ حدّث المتصفح ثم أعد المحاولة.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxDimension = 2600;
    const initialScale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const quality = Math.max(0.48, 0.9 - attempt * 0.045);
      const blob = await renderJpeg(bitmap, width, height, quality);
      if (blob.size > 0 && blob.size <= MAX_OUTPUT_BYTES) {
        const baseName = file.name.replace(/\.[^.]+$/, "") || "supplier-invoice";
        return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
      }
      width = Math.max(1, Math.floor(width * 0.84));
      height = Math.max(1, Math.floor(height * 0.84));
    }
    throw new Error("تعذر ضغط صورة الفاتورة بالحجم المناسب. اختر صورة أقل دقة.");
  } finally {
    bitmap.close();
  }
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذر تجهيز الصورة لإرسالها إلى خدمة القراءة."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة الصورة المضغوطة."));
    reader.readAsDataURL(file);
  });
}

async function renderJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("تعذر تجهيز صورة الفاتورة.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/jpeg", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("تعذر تجهيز صورة الفاتورة.");
  context.fillStyle = "#fff";
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر ضغط صورة الفاتورة.")), "image/jpeg", quality));
}
