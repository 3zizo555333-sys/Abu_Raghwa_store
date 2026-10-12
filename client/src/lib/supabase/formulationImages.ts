import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

const FORMULATION_IMAGE_PATH = /^[0-9a-fA-F-]{36}\/formulations\/[0-9a-fA-F-]{36}\/[0-9a-fA-F-]{36}\.webp$/;

export function isFormulationImageStoragePath(value: unknown): value is string {
  return typeof value === "string" && FORMULATION_IMAGE_PATH.test(value);
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
  const image = await prepareCloudProductImage(input.file);
  if (image.size < 1 || image.size > 5 * 1024 * 1024) throw new Error("يجب ألا يتجاوز حجم الصورة المضغوطة 5 ميجابايت.");
  const supabase = getSupabaseClient();
  const imageId = globalThis.crypto.randomUUID();
  const storagePath = `${shopId}/formulations/${input.formulationId}/${imageId}.webp`;
  const bucket = supabase.storage.from("product-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const registered = await supabase.rpc("register_formulation_image", {
    p_shop_id: shopId,
    p_formulation_id: input.formulationId,
    p_expected_version: input.expectedVersion,
    p_image_id: imageId,
    p_storage_path: storagePath,
    p_content_type: "image/webp",
    p_size_bytes: image.size,
  });
  if (registered.error || !registered.data) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Uploaded formulation image cleanup failed.", cleanup.error.message);
    throw new Error(registered.error?.message ?? "لم يؤكد الخادم ربط الصورة بالتركيبة.");
  }

  const row = requireCloudResult(registered) as { storage_path?: string; version?: number };
  let signedUrl = "";
  try { signedUrl = await getSignedFormulationImageUrl(storagePath); } catch { /* The private object is registered; a later list refresh can renew its signed URL. */ }
  if (input.previousStoragePath && input.previousStoragePath !== storagePath && isFormulationImageStoragePath(input.previousStoragePath)) {
    const removed = await bucket.remove([input.previousStoragePath]);
    if (removed.error) console.warn("Replaced formulation image could not be removed.", removed.error.message);
  }
  return { storagePath: row.storage_path || storagePath, signedUrl, version: Number(row.version) || input.expectedVersion + 1 };
}

export async function removeCloudFormulationImage(storagePath: string) {
  if (!isFormulationImageStoragePath(storagePath)) return;
  const result = await getSupabaseClient().storage.from("product-images").remove([storagePath]);
  if (result.error) throw new Error(result.error.message);
}
