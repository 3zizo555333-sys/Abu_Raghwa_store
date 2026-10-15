import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

const FORMULATION_IMAGE_PATH = /^[0-9a-fA-F-]{36}\/formulations\/[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.(?:webp|jpe?g)$/;
const PUBLIC_FORMULA_MARKER = "/storage/v1/object/public/formulas/";
type ImageLocation = { bucket: "formulas" | "product-images"; path: string };

export function isFormulationImageStoragePath(value: unknown): value is string {
  return typeof value === "string" && FORMULATION_IMAGE_PATH.test(value);
}

function getPublicFormulaPath(value: string): string | null {
  try {
    const url = new URL(value);
    const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
    if (!configuredUrl || url.origin !== new URL(configuredUrl).origin) return null;
    const markerIndex = url.pathname.indexOf(PUBLIC_FORMULA_MARKER);
    if (markerIndex < 0) return null;
    const path = decodeURIComponent(url.pathname.slice(markerIndex + PUBLIC_FORMULA_MARKER.length));
    return isFormulationImageStoragePath(path) ? path : null;
  } catch {
    return null;
  }
}

function resolveImageLocation(value: string): ImageLocation | null {
  if (isFormulationImageStoragePath(value)) return { bucket: "product-images", path: value };
  const publicFormulaPath = getPublicFormulaPath(value);
  return publicFormulaPath ? { bucket: "formulas", path: publicFormulaPath } : null;
}

export function isPublicFormulationImageUrl(value: unknown): value is string {
  return typeof value === "string" && getPublicFormulaPath(value) !== null;
}

export async function getSignedFormulationImageUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
  if (!isFormulationImageStoragePath(storagePath)) throw new Error("مسار صورة التركيبة غير صالح.");
  const { data, error } = await getSupabaseClient().storage.from("product-images").createSignedUrl(storagePath, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذر إنشاء رابط موقّع لصورة التركيبة.");
  return data.signedUrl;
}

export async function getSignedFormulationImageUrls(storagePaths: string[], expiresInSeconds = 900): Promise<Map<string, string>> {
  const paths = Array.from(new Set(storagePaths.filter(isFormulationImageStoragePath)));
  if (!paths.length) return new Map();
  const { data, error } = await getSupabaseClient().storage.from("product-images").createSignedUrls(paths, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (error) throw new Error(error.message);
  const result = new Map<string, string>();
  for (const item of data ?? []) if (item.path && item.signedUrl) result.set(item.path, item.signedUrl);
  return result;
}

export async function uploadCloudFormulationImage(input: { formulationId: string; expectedVersion: number; file: File; previousStoragePath?: string }) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("رفع صور التركيبات متاح للإدارة فقط.");
  const image = await prepareCloudProductImage(input.file, { allowJpegFallback: true });
  if (image.size < 1 || image.size >= 300_000) throw new Error("يجب أن تكون الصورة المضغوطة أقل من 300KB.");

  const contentType = image.type === "image/webp" ? "image/webp" : image.type === "image/jpeg" ? "image/jpeg" : null;
  if (!contentType) throw new Error("صيغة الصورة المضغوطة غير مدعومة.");
  const extension = contentType === "image/webp" ? "webp" : "jpg";
  const imageId = globalThis.crypto.randomUUID();
  const storagePath = `${shopId}/formulations/${input.formulationId}/${imageId}.${extension}`;
  const supabase = getSupabaseClient();
  const bucket = supabase.storage.from("formulas");
  const uploaded = await bucket.upload(storagePath, image, { contentType, cacheControl: "3600", upsert: false });
  if (uploaded.error) throw new Error(`فشل رفع الصورة المضغوطة إلى مخزن التركيبات: ${uploaded.error.message}`);

  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
  if (!publicUrl || !isPublicFormulationImageUrl(publicUrl)) {
    await bucket.remove([storagePath]).catch(() => undefined);
    throw new Error("تعذر استخراج رابط القراءة العام لصورة التركيبة؛ أُلغي الربط ولم يُترك ملف يتيم.");
  }

  const registered = await supabase.rpc("register_public_formulation_image", {
    p_shop_id: shopId,
    p_formulation_id: input.formulationId,
    p_expected_version: input.expectedVersion,
    p_image_id: imageId,
    p_storage_path: storagePath,
    p_public_url: publicUrl,
    p_content_type: contentType,
    p_size_bytes: image.size,
  });
  if (registered.error || !registered.data) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Uploaded formula image cleanup failed.", cleanup.error.message);
    throw new Error(registered.error?.message ?? "لم يؤكد الخادم ربط رابط الصورة العام بسجل التركيبة.");
  }

  const row = requireCloudResult(registered) as { public_url?: string; version?: number };
  if (row.public_url !== publicUrl || !Number.isFinite(Number(row.version))) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Unverified formula image cleanup failed.", cleanup.error.message);
    throw new Error("لم يؤكد الخادم رابط الصورة المخزن في سجل التركيبة.");
  }

  if (input.previousStoragePath) {
    const previous = resolveImageLocation(input.previousStoragePath);
    if (previous && !(previous.bucket === "formulas" && previous.path === storagePath)) {
      const removed = await supabase.storage.from(previous.bucket).remove([previous.path]);
      if (removed.error) console.warn("Replaced formula image could not be removed.", removed.error.message);
    }
  }
  return { storagePath, publicUrl, version: Number(row.version) };
}

export async function removeCloudFormulationImage(storagePathOrPublicUrl: string) {
  const location = resolveImageLocation(storagePathOrPublicUrl);
  if (!location) return;
  const result = await getSupabaseClient().storage.from(location.bucket).remove([location.path]);
  if (result.error) throw new Error(result.error.message);
}
