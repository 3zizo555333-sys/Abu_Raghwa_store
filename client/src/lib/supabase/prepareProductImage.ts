const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 300 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function prepareCloudProductImage(file: File): Promise<Blob> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error("صيغة الصورة غير مدعومة. استخدم JPEG أو PNG أو WebP.");
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error("حجم الصورة الأصلية يتجاوز الحد المسموح (20 MB).");
  if (typeof createImageBitmap !== "function") throw new Error("المتصفح لا يدعم تجهيز الصورة الآمن؛ حدّث المتصفح ثم أعد المحاولة.");

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const quality = Math.max(0.3, 0.84 - attempt * 0.05);
      const blob = await renderWebp(bitmap, width, height, quality);
      if (blob.type !== "image/webp") throw new Error("تعذر ضغط الصورة إلى WebP في هذا المتصفح.");
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;
      width = Math.max(1, Math.floor(width * 0.78));
      height = Math.max(1, Math.floor(height * 0.78));
    }
    throw new Error("تعذر ضغط الصورة إلى أقل من 300KB. اختر صورة أصغر أو أقل دقة.");
  } finally {
    bitmap.close();
  }
}

async function renderWebp(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob> {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("تعذر تجهيز الصورة.");
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: "image/webp", quality });
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("تعذر تجهيز الصورة.");
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر ضغط الصورة.")), "image/webp", quality);
  });
}
