import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

export async function uploadCloudProductImage(input: { productId: string; expectedVersion: number; file: File }) {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId, role } = await getActiveShopContext();
  if (!(["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("رفع صور المنتجات متاح للإدارة فقط.");
  const imageId = globalThis.crypto.randomUUID();
  const image = await prepareCloudProductImage(input.file);
  const storagePath = `${shopId}/products/${input.productId}/${imageId}.webp`;
  const bucket = supabase.storage.from("product-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType: "image/webp", cacheControl: "3600", upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);

  const registered = await supabase.rpc("register_product_image", {
    p_shop_id: shopId,
    p_product_id: input.productId,
    p_expected_version: input.expectedVersion,
    p_image_id: imageId,
    p_storage_path: storagePath,
    p_content_type: "image/webp",
    p_size_bytes: image.size,
  });
  if (registered.error || !registered.data) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Uploaded image cleanup failed; orphan storage object requires reconciliation.", cleanup.error.message);
    throw new Error(registered.error?.message ?? "لم يؤكد الخادم ربط الصورة بالمنتج.");
  }
  return { imageId: requireCloudResult(registered), storagePath };
}

export async function getSignedProductImageUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from("product-images").createSignedUrl(storagePath, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذر إنشاء رابط مؤقت للصورة.");
  return data.signedUrl;
}
