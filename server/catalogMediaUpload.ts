import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/webp", "image/jpeg", "image/jpg"]);

type MultipartData = { fields: Record<string, string>; file?: { buffer: Buffer; mimetype: string } };

async function readMultipart(request: Request): Promise<MultipartData> {
  const contentType = String(request.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) throw new Error("صيغة رفع الصورة غير صالحة");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const chunks: Buffer[] = [];
  let total = 0;
  await new Promise<void>((resolve, reject) => {
    request.on("data", chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > MAX_FILE_BYTES + 256 * 1024) {
        reject(new Error("حجم طلب الصورة كبير"));
        request.destroy();
        return;
      }
      chunks.push(buffer);
    });
    request.on("end", () => resolve());
    request.on("error", reject);
  });
  const body = Buffer.concat(chunks);
  const fields: Record<string, string> = {};
  let file: MultipartData["file"];
  let cursor = 0;
  while (cursor < body.length) {
    const boundaryStart = body.indexOf(boundary, cursor);
    if (boundaryStart < 0) break;
    const partStart = boundaryStart + boundary.length;
    if (body.subarray(partStart, partStart + 2).toString() === "--") break;
    const headerStart = partStart + 2;
    const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart);
    if (headerEnd < 0) break;
    const headers = body.subarray(headerStart, headerEnd).toString("utf8");
    const nextBoundary = body.indexOf(boundary, headerEnd + 4);
    if (nextBoundary < 0) break;
    const contentEnd = nextBoundary - 2;
    const content = body.subarray(headerEnd + 4, contentEnd);
    const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (disposition) {
      const fieldName = disposition[1];
      const filename = disposition[2];
      if (filename !== undefined) {
        const type = headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase() || "";
        file = { buffer: Buffer.from(content), mimetype: type };
      } else {
        fields[fieldName] = content.toString("utf8");
      }
    }
    cursor = nextBoundary;
  }
  return { fields, file };
}

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
  const { data: memberships, error: membershipError } = await client.from("shop_memberships").select("shop_id,role").eq("user_id", authData.user.id).eq("status", "active").limit(2);
  if (membershipError) throw new Error("تعذر التحقق من عضوية المتجر");
  if (!memberships?.length || memberships.length > 1) throw new Error("لا توجد عضوية متجر واحدة صالحة لهذا الحساب");
  const membership = memberships[0];
  if (membership.role !== "manager" && membership.role !== "admin") throw new Error("رفع صور الفئات والشركات متاح للمدير فقط");
  return { client, shopId: membership.shop_id as string };
}

export async function catalogMediaUploadRoute(request: Request, response: Response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return response.status(405).json({ error: "Method not allowed" });
  }
  try {
    const { fields, file } = await readMultipart(request);
    const entityType = fields.entityType;
    const entityId = fields.entityId;
    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    if (entityType !== "category" && entityType !== "company") return response.status(400).json({ error: "نوع العنصر غير صالح" });
    if (typeof entityId !== "string" || !UUID_RE.test(entityId)) return response.status(400).json({ error: "معرّف العنصر غير صالح" });
    if (!name || name.length > 180) return response.status(400).json({ error: "اسم العنصر غير صالح" });
    if (!file?.buffer?.length || !IMAGE_TYPES.has(file.mimetype)) return response.status(400).json({ error: "اختر صورة WebP أو JPEG صالحة" });
    if (file.buffer.length > MAX_FILE_BYTES) return response.status(400).json({ error: "حجم الصورة كبير؛ اضغطها ثم أعد المحاولة" });
    const { client, shopId } = await requireCatalogManager(request);
    const table = entityType === "category" ? "catalog_categories" : "catalog_companies";
    const folder = entityType === "category" ? "categories" : "companies";
    const storagePath = `${shopId}/${folder}/${entityId}/${randomUUID()}.webp`;
    const bucket = client.storage.from("catalog-images");
    const { error: uploadError } = await bucket.upload(storagePath, file.buffer, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
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
    const status = /جلسة|عضوية|متاح للمدير|تسجيل الدخول/.test(message) ? 403 : 400;
    return response.status(status).json({ error: message });
  }
}
