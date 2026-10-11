import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

type SupportedImageMime = "image/jpeg" | "image/png" | "image/webp";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set<SupportedImageMime>(["image/jpeg", "image/png", "image/webp"]);
const IMAGE_UPLOAD_ROLES = ["manager", "admin", "supervisor"] as const;

export async function uploadPreparedCloudProductImage(input: {
  productId: string;
  expectedVersion: number;
  blob: Blob;
  mimeType: SupportedImageMime;
}): Promise<{ imageId: string; storagePath: string }> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!(IMAGE_UPLOAD_ROLES as readonly string[]).includes(role)) {
    throw new Error("رفع صور المنتجات متاح للإدارة فقط.");
  }
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new Error("إصدار المنتج غير صالح لربط الصورة.");
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(input.mimeType)) {
    throw new Error("صيغة صورة المنتج غير مدعومة.");
  }
  if (input.blob.size < 1 || input.blob.size > MAX_IMAGE_BYTES) {
    throw new Error("حجم صورة المنتج يجب ألا يتجاوز 5 ميجابايت بعد التجهيز.");
  }

  const supabase = getSupabaseClient();
  const imageId = globalThis.crypto.randomUUID();
  const extension = input.mimeType === "image/png" ? "png" : input.mimeType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${shopId}/products/${input.productId}/${imageId}.${extension}`;
  const bucket = supabase.storage.from("product-images");
  const uploaded = await bucket.upload(storagePath, input.blob, {
    contentType: input.mimeType,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);

  try {
    const registered = await supabase.rpc("register_product_image", {
      p_shop_id: shopId,
      p_product_id: input.productId,
      p_expected_version: input.expectedVersion,
      p_image_id: imageId,
      p_storage_path: storagePath,
      p_content_type: input.mimeType,
      p_size_bytes: input.blob.size,
    });
    const registeredImageId = requireCloudResult(registered);
    if (registeredImageId !== imageId) throw new Error("لم يؤكد الخادم ربط الصورة بالمنتج.");
    return { imageId, storagePath };
  } catch (error) {
    try {
      const cleanup = await bucket.remove([storagePath]);
      if (cleanup.error) console.error("Uploaded image cleanup failed; orphan storage object requires reconciliation.", cleanup.error.message);
    } catch (cleanupError) {
      console.error("Uploaded image cleanup failed; orphan storage object requires reconciliation.", cleanupError);
    }
    throw error;
  }
}

export async function uploadCloudProductImage(input: { productId: string; expectedVersion: number; file: File }) {
  const image = await prepareCloudProductImage(input.file);
  return uploadPreparedCloudProductImage({
    productId: input.productId,
    expectedVersion: input.expectedVersion,
    blob: image,
    mimeType: "image/webp",
  });
}

export async function getSignedProductImageUrl(storagePath: string, expiresInSeconds = 900): Promise<string> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.storage.from("product-images").createSignedUrl(storagePath, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذر إنشاء رابط مؤقت للصورة.");
  return data.signedUrl;
}
