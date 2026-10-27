import { assertCloudOnline, getSupabaseClient } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";

function explainUploadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/row-level security|rls|permission denied|not authorized|unauthorized/i.test(message)) {
    return "رفضت سياسة أمان قاعدة البيانات رفع الصورة أو حفظها. تأكد من صلاحية المدير/المسؤول وسياسة RLS الخاصة بمتجرك.";
  }
  if (/bucket|object.*not found|storage/i.test(message)) return `تعذر رفع الصورة إلى مساحة صور العروض: ${message}`;
  return message || "تعذر رفع صورة العرض. أعد المحاولة.";
}

export async function uploadCatalogOfferImage(offerId: string, file: File) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") {
    throw new Error("إضافة أو تغيير صور العروض متاح للمدير أو المسؤول فقط. اطلب من مدير المتجر تنفيذ ذلك.");
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(offerId)) throw new Error("معرّف العرض غير صالح.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("نوع الصورة غير مدعوم. اختر صورة JPEG أو PNG أو WebP.");
  }

  let image: Blob;
  try {
    image = await prepareCloudProductImage(file, { allowJpegFallback: true });
  } catch (error) {
    throw new Error(explainUploadError(error));
  }
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
    throw new Error("تعذر تجهيز الصورة بصيغة JPEG أو PNG أو WebP. اختر صورة أخرى.");
  }

  const extension = image.type === "image/webp" ? "webp" : image.type === "image/png" ? "png" : "jpg";
  const storagePath = `${shopId}/offers/${offerId}/${crypto.randomUUID()}.${extension}`;
  const supabase = getSupabaseClient();
  const bucket = supabase.storage.from("catalog-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType: image.type, cacheControl: "31536000", upsert: false });
  if (uploaded.error) throw new Error(explainUploadError(uploaded.error));

  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
  const updated = await supabase.from("store_offers").update({ image_url: publicUrl })
    .eq("id", offerId).eq("store_id", shopId).eq("shop_id", shopId).select("id").maybeSingle();
  if (updated.error) throw new Error(explainUploadError(updated.error));
  if (!updated.data) throw new Error("لم يتم حفظ الصورة: لم يُعثر على العرض ضمن المتجر الحالي، أو رفضت سياسة RLS التعديل.");
  return { publicUrl, storagePath };
}

export async function generateCatalogOfferBanner(offerId: string, options: { persistToOffer?: boolean } = {}) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") {
    throw new Error("توليد أو تغيير صور العروض متاح للمدير أو المسؤول فقط. اطلب من مدير المتجر تنفيذ ذلك.");
  }
  if (!/^[0-9a-fA-F-]{36}$/.test(offerId)) throw new Error("معرّف العرض غير صالح. احفظ العرض أولاً ثم أعد المحاولة.");

  const prompt = "commercial panoramic advertising banner background for laundry and cleaning products, floating realistic glossy soap bubbles, dynamic splashing soap foam, luxurious studio lighting, clean glossy podium, 3d hyper-realistic, photorealistic 8k, cinematic depth of field, minimalist center, no text, no typography";
  const url = new URL(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`);
  url.search = new URLSearchParams({ width: "1200", height: "480", model: "flux", nologo: "true", seed: String(Math.floor(Math.random() * 2_147_483_647)) }).toString();
  let source: Blob;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(url.toString(), { signal: controller.signal, cache: "no-store" });
    if (!response.ok) throw new Error(`generation failed (${response.status})`);
    source = await response.blob();
    if (!source.type.startsWith("image/") || source.size === 0) throw new Error("invalid image");
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("استغرق توليد البانر وقتاً أطول من المتوقع. أعد المحاولة لاحقاً.");
    }
    throw new Error("تعذر توليد البانر من خدمة الصور السحابية. تحقق من الاتصال ثم أعد المحاولة.");
  } finally {
    window.clearTimeout(timeout);
  }

  let image: Blob;
  try {
    const file = new File([source], "ai-banner-source", { type: source.type });
    image = await prepareCloudProductImage(file, { allowJpegFallback: true, jpegOnly: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new Error(message || "تعذر ضغط البانر إلى JPEG أقل من 300KB. أعد المحاولة.");
  }
  if (image.type !== "image/jpeg" || image.size >= 300_000) throw new Error("تعذر تجهيز البانر بصيغة JPEG ضمن حد التخزين البالغ 300KB.");

  const timestamp = Date.now();
  const storagePath = `${shopId}/offers/${offerId}/ai-banner-${timestamp}-${crypto.randomUUID()}.jpg`;
  const bucket = getSupabaseClient().storage.from("catalog-images");
  const uploaded = await bucket.upload(storagePath, image, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (uploaded.error) throw new Error(explainUploadError(uploaded.error));
  const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
  if (options.persistToOffer === false) return { publicUrl, storagePath, savedToExistingOffer: false };
  const updated = await getSupabaseClient().from("store_offers").update({ image_url: publicUrl })
    .eq("id", offerId).eq("store_id", shopId).eq("shop_id", shopId).select("id").maybeSingle();
  if (updated.error) throw new Error(explainUploadError(updated.error));
  if (!updated.data) throw new Error("تم رفع البانر، لكن لم يُحفظ في العرض الحالي. تحقق من أن العرض تابع للمتجر ثم أعد المحاولة.");
  return { publicUrl, storagePath, savedToExistingOffer: true };
}

export async function removeCatalogOfferImage(storagePath: string) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("حذف صور العروض متاح للمدير أو المسؤول فقط.");
  if (!storagePath.startsWith(`${shopId}/offers/`)) throw new Error("لا يمكن حذف صورة من متجر آخر.");
  const removed = await getSupabaseClient().storage.from("catalog-images").remove([storagePath]);
  if (removed.error) throw new Error(explainUploadError(removed.error));
}
