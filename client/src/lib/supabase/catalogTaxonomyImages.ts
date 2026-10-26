import { assertCloudOnline, getSupabaseClient } from "./client";
import { getActiveShopContext } from "./products";

export type CatalogTaxonomyKind = "categories" | "companies";
type UploadResponse = { publicUrl: string; storagePath: string };
const MAX_UPLOAD_BYTES = 150 * 1024;

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("تعذر ضغط الصورة")), type, quality));
}

async function compressCatalogImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("اختر ملف صورة صالحاً");
  const bitmap = await createImageBitmap(file);
  let width = bitmap.width;
  let height = bitmap.height;
  const scale = Math.min(1, 800 / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  const preferredType = canvas.toDataURL("image/webp").startsWith("data:image/webp") ? "image/webp" : "image/jpeg";
  let blob: Blob | null = null;
  let quality = 0.8;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("المتصفح لا يدعم تجهيز الصور");
    context.clearRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    blob = await canvasBlob(canvas, preferredType, quality);
    if (blob.size <= MAX_UPLOAD_BYTES) break;
    if (quality > 0.5) quality -= 0.1;
    else { width = Math.max(240, Math.round(width * 0.85)); height = Math.max(240, Math.round(height * 0.85)); }
  }
  bitmap.close();
  if (!blob || blob.size > MAX_UPLOAD_BYTES) throw new Error("تعذر ضغط الصورة إلى أقل من 150KB؛ اختر صورة أصغر");
  const extension = preferredType === "image/webp" ? "webp" : "jpg";
  return new File([blob], `catalog-${Date.now()}.${extension}`, { type: preferredType, lastModified: Date.now() });
}

export async function uploadCatalogTaxonomyImage(kind: CatalogTaxonomyKind, entityId: string, name: string, file: File): Promise<UploadResponse> {
  assertCloudOnline();
  const context = await getActiveShopContext();
  if (context.role !== "manager" && context.role !== "admin") throw new Error("صور الفئات والشركات متاحة للمدير فقط.");
  if (!/^[0-9a-fA-F-]{36}$/.test(entityId)) throw new Error("معرّف الفئة أو الشركة غير صالح.");
  const compressed = await compressCatalogImage(file);
  const { data: sessionResult, error: sessionError } = await getSupabaseClient().auth.getSession();
  const accessToken = sessionResult.session?.access_token;
  if (sessionError || !accessToken) throw new Error("انتهت الجلسة السحابية. سجّل الدخول مجدداً.");
  const body = new FormData();
  body.append("file", compressed, compressed.name);
  body.append("entityType", kind === "categories" ? "category" : "company");
  body.append("entityId", entityId);
  body.append("name", name);
  const response = await fetch("/api/catalog/upload-media", { method: "POST", headers: { Authorization: `Bearer ${accessToken}` }, body });
  const payload = await response.json().catch(() => ({})) as Partial<UploadResponse> & { error?: string };
  if (!response.ok || typeof payload.publicUrl !== "string" || typeof payload.storagePath !== "string") throw new Error(payload.error || "تعذر رفع الصورة");
  return { publicUrl: payload.publicUrl, storagePath: payload.storagePath };
}

export async function removeCatalogTaxonomyImage(storagePath: string) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("حذف صور الفئات والشركات متاح للمدير فقط.");
  if (!storagePath.startsWith(`${shopId}/categories/`) && !storagePath.startsWith(`${shopId}/companies/`)) throw new Error("لا يمكن حذف صورة من متجر آخر.");
  const removed = await getSupabaseClient().storage.from("catalog-images").remove([storagePath]);
  if (removed.error) throw new Error(removed.error.message);
}
