import { getActiveShopContext } from "./products";
import { assertCloudOnline, getSupabaseClient } from "./client";

export async function uploadCommunityImage(dataUrl: string, kind: "prize" | "question" | "banner"): Promise<string> {
  assertCloudOnline();
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const { shopId } = await getActiveShopContext(true);
  const blob = await (await fetch(dataUrl)).blob();
  if (!blob.type.startsWith("image/")) throw new Error("صيغة صورة المجتمع غير مدعومة.");
  const extension = blob.type === "image/webp" ? "webp" : "png";
  const path = `${shopId}/community/${kind}/${crypto.randomUUID()}.${extension}`;
  const bucket = getSupabaseClient().storage.from("community-images");
  const uploaded = await bucket.upload(path, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
  if (uploaded.error) throw new Error(`تعذر رفع صورة المجتمع: ${uploaded.error.message}`);
  return bucket.getPublicUrl(path).data.publicUrl;
}
