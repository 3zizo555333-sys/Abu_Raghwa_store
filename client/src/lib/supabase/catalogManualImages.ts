import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

export async function uploadCatalogManualProductImage(productId: string, file: File) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("صور منتجات الكتالوج متاحة للمدير فقط.");
  const client = getSupabaseClient();
  const existing = requireCloudResult(await client.from("catalog_manual_products").select("catalog_image_storage_path").eq("shop_id", shopId).eq("id", productId).is("deleted_at", null).maybeSingle()) as { catalog_image_storage_path: string | null } | null;
  if (!existing) throw new Error("المنتج اليدوي غير موجود في المتجر الحالي.");

  const compressed = await prepareCloudProductImage(file, { allowJpegFallback: true });
  const extension = compressed.type === "image/webp" ? "webp" : "jpg";
  const imageId = crypto.randomUUID();
  const storagePath = `${shopId}/manual-products/${productId}/${imageId}.${extension}`;
  const bucket = client.storage.from("catalog-product-images");
  const upload = await bucket.upload(storagePath, compressed, { contentType: compressed.type, cacheControl: "31536000", upsert: false });
  if (upload.error) throw new Error(upload.error.message);
  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
  return { publicUrl, storagePath, previousStoragePath: existing.catalog_image_storage_path };
}

export async function removeCatalogManualProductImage(storagePath: string) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if ((role !== "manager" && role !== "admin") || !storagePath.startsWith(`${shopId}/manual-products/`)) throw new Error("لا يمكن حذف صورة من متجر آخر.");
  const result = await getSupabaseClient().storage.from("catalog-product-images").remove([storagePath]);
  if (result.error) throw new Error(result.error.message);
}
