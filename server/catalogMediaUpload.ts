import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, /^image\/(webp|jpeg|png|jpg)$/i.test(file.mimetype)),
}).single("file");

let serviceClient: SupabaseClient | undefined;
function getServiceClient() {
  if (serviceClient) return serviceClient;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("إعدادات Supabase الخلفية غير مكتملة");
  serviceClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return serviceClient;
}

function headerValue(request: Request, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function requireCatalogManager(request: Request) {
  const authorization = headerValue(request, "authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("يلزم تسجيل الدخول السحابي");
  const token = authorization.slice("Bearer ".length).trim();
  if (!token) throw new Error("جلسة الدخول غير صالحة");
  const client = getServiceClient();
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) throw new Error("انتهت جلسة الدخول السحابية");
  const { data: memberships, error: membershipError } = await client
    .from("shop_memberships")
    .select("shop_id,role")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(2);
  if (membershipError) throw new Error("تعذر التحقق من عضوية المتجر");
  if (!memberships?.length || memberships.length > 1) throw new Error("لا توجد عضوية متجر واحدة صالحة لهذا الحساب");
  const membership = memberships[0];
  if (membership.role !== "manager" && membership.role !== "admin") throw new Error("رفع صور الفئات والشركات متاح للمدير فقط");
  return { client, shopId: membership.shop_id as string };
}

export function catalogMediaUploadRoute(request: Request, response: Response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  upload(request, response, async error => {
    if (error) {
      const message = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE" ? "حجم الصورة كبير؛ اضغطها ثم أعد المحاولة" : "ملف الصورة غير صالح";
      return response.status(400).json({ error: message });
    }
    try {
      const entityType = request.body?.entityType;
      const entityId = request.body?.entityId;
      const name = typeof request.body?.name === "string" ? request.body.name.trim() : "";
      if (entityType !== "category" && entityType !== "company") return response.status(400).json({ error: "نوع العنصر غير صالح" });
      if (typeof entityId !== "string" || !UUID_RE.test(entityId)) return response.status(400).json({ error: "معرّف العنصر غير صالح" });
      if (!name || name.length > 180) return response.status(400).json({ error: "اسم العنصر غير صالح" });
      if (!request.file?.buffer?.length) return response.status(400).json({ error: "اختر صورة أولاً" });
      const { client, shopId } = await requireCatalogManager(request);
      const table = entityType === "category" ? "catalog_categories" : "catalog_companies";
      const folder = entityType === "category" ? "categories" : "companies";
      const storagePath = `${shopId}/${folder}/${entityId}/${randomUUID()}.webp`;
      const bucket = client.storage.from("catalog-images");
      const { error: uploadError } = await bucket.upload(storagePath, request.file.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
      if (uploadError) throw new Error(uploadError.message);
      const publicUrl = bucket.getPublicUrl(storagePath).data.publicUrl;
      const { error: updateError } = await client.from(table).update({ image_url: publicUrl, image_storage_path: storagePath }).eq("id", entityId).eq("shop_id", shopId).is("deleted_at", null);
      if (updateError) {
        await bucket.remove([storagePath]).catch(() => undefined);
        throw new Error(updateError.message);
      }
      return response.status(200).json({ publicUrl, storagePath, entityType, entityId, name });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "تعذر رفع الصورة";
      const status = /جلسة|عضوية|متاح للمدير|تسجيل الدخول/.test(message) ? 403 : 500;
      return response.status(status).json({ error: message });
    }
  });
}
