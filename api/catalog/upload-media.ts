import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/webp", "image/jpeg", "image/jpg"]);

type Parsed = { fields: Record<string, string>; file?: { buffer: Buffer; mimetype: string } };
async function parseMultipart(request: Request): Promise<Parsed> {
  const header = String(request.headers["content-type"] || "");
  const match = header.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("صيغة رفع الصورة غير صالحة");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const chunks: Buffer[] = []; let size = 0;
  await new Promise<void>((resolve, reject) => {
    request.on("data", chunk => { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += part.length; if (size > MAX_FILE_BYTES + 256 * 1024) { reject(new Error("حجم طلب الصورة كبير")); request.destroy(); return; } chunks.push(part); });
    request.on("end", resolve); request.on("error", reject);
  });
  const body = Buffer.concat(chunks); const fields: Record<string, string> = {}; let file: Parsed["file"]; let cursor = 0;
  while (cursor < body.length) {
    const start = body.indexOf(boundary, cursor); if (start < 0 || body.subarray(start + boundary.length, start + boundary.length + 2).toString() === "--") break;
    const headerStart = start + boundary.length + 2; const headerEnd = body.indexOf(Buffer.from("\r\n\r\n"), headerStart); if (headerEnd < 0) break;
    const next = body.indexOf(boundary, headerEnd + 4); if (next < 0) break;
    const headers = body.subarray(headerStart, headerEnd).toString(); const content = body.subarray(headerEnd + 4, next - 2);
    const disposition = headers.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    if (disposition) { if (disposition[2] !== undefined) file = { buffer: Buffer.from(content), mimetype: headers.match(/content-type:\s*([^\r\n;]+)/i)?.[1]?.trim().toLowerCase() || "" }; else fields[disposition[1]] = content.toString(); }
    cursor = next;
  }
  return { fields, file };
}

function config() {
  const url = process.env.SUPABASE_URL?.trim(); const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new Error("إعدادات Supabase الخلفية غير مكتملة");
  return { url: url.replace(/\/$/, ""), key };
}
function bearer(request: Request) { const value = request.headers.authorization; if (!value?.startsWith("Bearer ")) throw new Error("يلزم تسجيل الدخول السحابي"); return value.slice(7).trim(); }
async function supabaseJson(url: string, init: RequestInit) { const response = await fetch(url, init); const text = await response.text(); if (!response.ok) throw new Error(text || `Supabase ${response.status}`); return text ? JSON.parse(text) : null; }

export default async function uploadMedia(request: Request, response: Response) {
  if (request.method !== "POST") { response.setHeader("Allow", "POST"); return response.status(405).json({ error: "Method not allowed" }); }
  try {
    const { fields, file } = await parseMultipart(request); const entityType = fields.entityType; const entityId = fields.entityId; const name = String(fields.name || "").trim();
    if (entityType !== "category" && entityType !== "company") return response.status(400).json({ error: "نوع العنصر غير صالح" });
    if (!UUID_RE.test(String(entityId || ""))) return response.status(400).json({ error: "معرّف العنصر غير صالح" });
    if (!name || name.length > 180) return response.status(400).json({ error: "اسم العنصر غير صالح" });
    if (!file?.buffer?.length || !IMAGE_TYPES.has(file.mimetype) || file.buffer.length > MAX_FILE_BYTES) return response.status(400).json({ error: "اختر صورة WebP أو JPEG أقل من 2MB" });
    const { url, key } = config(); const token = bearer(request); const authHeaders = { apikey: key, Authorization: `Bearer ${key}` };
    const user = await supabaseJson(`${url}/auth/v1/user`, { headers: { ...authHeaders, Authorization: `Bearer ${token}` } });
    const memberships = await supabaseJson(`${url}/rest/v1/shop_memberships?user_id=eq.${encodeURIComponent(user.id)}&status=eq.active&select=shop_id,role&limit=2`, { headers: authHeaders });
    if (!Array.isArray(memberships) || memberships.length !== 1 || !["manager", "admin"].includes(memberships[0].role)) throw new Error("رفع صور الفئات والشركات متاح للمدير فقط");
    const shopId = memberships[0].shop_id; const folder = entityType === "category" ? "categories" : "companies"; const storagePath = `${shopId}/${folder}/${entityId}/${randomUUID()}.webp`;
    const upload = await fetch(`${url}/storage/v1/object/catalog-images/${storagePath}`, { method: "POST", headers: { ...authHeaders, "Content-Type": "image/webp", "Cache-Control": "31536000", "x-upsert": "false" }, body: new Uint8Array(file.buffer) });
    if (!upload.ok) throw new Error(await upload.text() || "تعذر تخزين الصورة");
    const table = entityType === "category" ? "catalog_categories" : "catalog_companies"; const publicUrl = `${url}/storage/v1/object/public/catalog-images/${storagePath}`;
    await supabaseJson(`${url}/rest/v1/${table}?id=eq.${entityId}&shop_id=eq.${shopId}&deleted_at=is.null`, { method: "PATCH", headers: { ...authHeaders, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify({ image_url: publicUrl, image_storage_path: storagePath }) });
    return response.status(200).json({ publicUrl, storagePath, entityType, entityId, name });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر رفع الصورة"; const status = /تسجيل الدخول|المدير|عضوية|Supabase 401|Supabase 403/.test(message) ? 403 : 400;
    return response.status(status).json({ error: message });
  }
}
