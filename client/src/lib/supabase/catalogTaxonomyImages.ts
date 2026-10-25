import { assertCloudOnline, getSupabaseClient } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

export type CatalogTaxonomyKind = "categories" | "companies";

export async function uploadCatalogTaxonomyImage(kind: CatalogTaxonomyKind, entityId: string, file: File) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("صور الفئات والشركات متاحة للمدير فقط.");
  if (!/^[0-9a-fA-F-]{36}$/.test(entityId)) throw new Error("معرّف الفئة أو الشركة غير صالح.");
  const image = await prepareCloudProductImage(file, { allowJpegFallback: true });
  if (image.type !== "image/webp" && image.type !== "image/jpeg") throw new Error("صيغة الصورة غير مدعومة.");
  const extension = image.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${shopId}/${kind}/${entityId}/${crypto.randomUUID()}.${extension}`;
  const bucket = getSupabaseClient().storage.from("catalog-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType: image.type, cacheControl: "31536000", upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);
  return { publicUrl: bucket.getPublicUrl(storagePath).data.publicUrl, storagePath };
}

export async function removeCatalogTaxonomyImage(storagePath: string) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("حذف صور الفئات والشركات متاح للمدير فقط.");
  if (!storagePath.startsWith(`${shopId}/categories/`) && !storagePath.startsWith(`${shopId}/companies/`)) throw new Error("لا يمكن حذف صورة من متجر آخر.");
  const removed = await getSupabaseClient().storage.from("catalog-images").remove([storagePath]);
  if (removed.error) throw new Error(removed.error.message);
}
