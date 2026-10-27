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

export async function removeCatalogOfferImage(storagePath: string) {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("حذف صور العروض متاح للمدير أو المسؤول فقط.");
  if (!storagePath.startsWith(`${shopId}/offers/`)) throw new Error("لا يمكن حذف صورة من متجر آخر.");
  const removed = await getSupabaseClient().storage.from("catalog-images").remove([storagePath]);
  if (removed.error) throw new Error(explainUploadError(removed.error));
}
