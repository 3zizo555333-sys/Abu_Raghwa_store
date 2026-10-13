import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";
import type { Database } from "./database.types";

export type FeatureImageType = "invoice" | "expense" | "raw_material";
type ImageRow = Database["public"]["Tables"]["shop_feature_images"]["Row"];

async function contextForImage(featureType: FeatureImageType) {
  const context = await getActiveShopContext();
  const manager = context.role === "manager" || context.role === "admin";
  if (!manager && !(context.role === "supervisor" && featureType !== "expense")) {
    throw new Error(featureType === "expense" ? "إيصالات المصروفات متاحة للمدير فقط." : "رفع هذه الصورة متاح للمدير أو المشرف فقط.");
  }
  return context;
}

export async function uploadShopFeatureImage(input: {
  featureType: FeatureImageType;
  ownerId: string;
  file: File;
  fileName?: string;
  supplierAccountId?: string | null;
}) {
  assertCloudOnline();
  const { shopId } = await contextForImage(input.featureType);
  const ownerId = input.ownerId.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(ownerId)) throw new Error("معرّف سجل الصورة غير صالح.");
  if (input.featureType !== "invoice" && input.supplierAccountId) throw new Error("ربط المورد مسموح لصور الفواتير فقط.");
  const image = await prepareCloudProductImage(input.file, { allowJpegFallback: true });
  if (image.size <= 0 || image.size >= 300_000) throw new Error("يجب أن يقل حجم الصورة بعد الضغط عن 300KB.");
  const contentType = image.type;
  if (contentType !== "image/webp" && contentType !== "image/jpeg") throw new Error("صيغة الصورة المضغوطة غير مدعومة.");
  const id = crypto.randomUUID();
  const extension = contentType === "image/webp" ? "webp" : "jpg";
  const storagePath = `${shopId}/${input.featureType}/${ownerId}/${id}.${extension}`;
  const client = getSupabaseClient();
  const bucket = client.storage.from("shop-feature-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType, cacheControl: "3600", upsert: false });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const metadata = await client.from("shop_feature_images").insert({
    id,
    shop_id: shopId,
    feature_type: input.featureType,
    owner_id: ownerId,
    supplier_account_id: input.supplierAccountId ?? null,
    storage_path: storagePath,
    content_type: contentType,
    size_bytes: image.size,
    file_name: (input.fileName || input.file.name || `image-${id}.${extension}`).slice(0, 255),
  }).select("*").single();
  if (metadata.error || !metadata.data) {
    const cleanup = await bucket.remove([storagePath]);
    if (cleanup.error) console.error("Feature image orphan cleanup failed.", cleanup.error.message);
    throw new Error(metadata.error?.message ?? "لم يؤكد Supabase تسجيل الصورة.");
  }
  const signed = await bucket.createSignedUrl(storagePath, 3600);
  if (signed.error || !signed.data?.signedUrl) throw new Error(signed.error?.message ?? "تعذر إنشاء رابط الصورة.");
  return { row: metadata.data as ImageRow, signedUrl: signed.data.signedUrl };
}

export async function signShopFeatureImages(storagePaths: string[], expiresInSeconds = 3600): Promise<Record<string, string>> {
  const unique = Array.from(new Set(storagePaths.filter(Boolean)));
  if (!unique.length) return {};
  const { role } = await getActiveShopContext();
  if (!(["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("عرض صور المميزات يتطلب صلاحية الإدارة أو المشرف.");
  const result = await getSupabaseClient().storage.from("shop-feature-images").createSignedUrls(unique, Math.min(Math.max(expiresInSeconds, 60), 3600));
  if (result.error) throw new Error(result.error.message);
  const urls: Record<string, string> = {};
  for (const item of result.data ?? []) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  return urls;
}

export async function listShopFeatureImages(featureType: FeatureImageType, ownerId: string): Promise<ImageRow[]> {
  const { shopId } = await contextForImage(featureType);
  const result = await getSupabaseClient().from("shop_feature_images").select("*").eq("shop_id", shopId).eq("feature_type", featureType).eq("owner_id", ownerId).order("created_at", { ascending: false }).limit(2000);
  return requireCloudResult(result) as ImageRow[];
}

export async function listShopFeatureImagesForOwners(featureType: FeatureImageType, ownerIds: string[]): Promise<ImageRow[]> {
  const unique = Array.from(new Set(ownerIds.filter(id => /^[A-Za-z0-9_-]{1,80}$/.test(id))));
  if (!unique.length) return [];
  const { shopId } = await contextForImage(featureType);
  const rows: ImageRow[] = [];
  for (let offset = 0; offset < unique.length; offset += 200) {
    const result = await getSupabaseClient().from("shop_feature_images").select("*").eq("shop_id", shopId).eq("feature_type", featureType).in("owner_id", unique.slice(offset, offset + 200)).order("created_at", { ascending: false }).limit(10000);
    rows.push(...(requireCloudResult(result) as ImageRow[]));
  }
  return rows;
}

export async function deleteShopFeatureImage(image: Pick<ImageRow, "id" | "storage_path" | "feature_type">) {
  assertCloudOnline();
  const { shopId } = await contextForImage(image.feature_type);
  const client = getSupabaseClient();
  const removed = await client.storage.from("shop-feature-images").remove([image.storage_path]);
  if (removed.error) throw new Error(removed.error.message);
  const result = await client.from("shop_feature_images").delete().eq("id", image.id).eq("shop_id", shopId).eq("storage_path", image.storage_path).select("id").single();
  return requireCloudResult(result);
}
