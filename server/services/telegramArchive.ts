import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { gzipSync } from "node:zlib";
import type { Request, Response } from "express";

const MAX_ARCHIVE_BYTES = 48 * 1024 * 1024;
const MAX_ARCHIVE_RAW_BYTES = 64 * 1024 * 1024;
const MAX_ARCHIVE_PAGE = 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNEL_ID_RE = /^(?:-?[0-9]{1,25}|@[A-Za-z0-9_]{5,32})$/;
const TOKEN_RE = /^[0-9]{5,12}:[A-Za-z0-9_-]{20,}$/;
const TELEGRAM_API = "https://api.telegram.org";

type Role = "manager" | "admin" | "supervisor" | "seller";
type AuthContext = { client: SupabaseClient; userId: string; shopId: string; role: Role };
type OutboxEvent = { id: string; shop_id: string; event_type: "sale_receipt" | "low_stock"; event_key: string; payload: Record<string, unknown>; attempts: number };
type SafeSettings = {
  shop_id: string; sales_channel_id: string; archive_channel_id: string; backup_channel_id: string;
  is_enabled: boolean; notify_live_sales: boolean; notify_low_stock: boolean; enable_daily_backup: boolean;
  has_bot_token?: boolean;
};

type TelegramResult<T> = { ok: boolean; result?: T; description?: string; error_code?: number };

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !key) throw new Error("SUPABASE_SERVER_CONFIG_MISSING");
  return { url, key };
}

function adminClient(): SupabaseClient {
  const { url, key } = supabaseConfig();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function getBearer(req: Request): string {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  const token = header.slice(7).trim();
  if (!token || token.length > 4096) throw new Error("AUTH_REQUIRED");
  return token;
}

export async function authorizeShop(req: Request, shopIdValue: unknown, allowedRoles: Role[] = ["manager", "admin"]): Promise<AuthContext> {
  const shopId = String(shopIdValue || "");
  if (!UUID_RE.test(shopId)) throw new Error("INVALID_SHOP");
  const client = adminClient();
  const { data: userResult, error: userError } = await client.auth.getUser(getBearer(req));
  if (userError || !userResult.user) throw new Error("AUTH_REQUIRED");
  const { data: membership, error } = await client.from("shop_memberships")
    .select("role,status").eq("user_id", userResult.user.id).eq("shop_id", shopId).maybeSingle();
  if (error || !membership || membership.status !== "active" || !allowedRoles.includes(membership.role as Role)) {
    throw new Error("SHOP_ROLE_REQUIRED");
  }
  return { client, userId: userResult.user.id, shopId, role: membership.role as Role };
}

function safeStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "SHOP_ROLE_REQUIRED") return 403;
  if (message === "INVALID_SHOP") return 400;
  if (message === "SUPABASE_SERVER_CONFIG_MISSING") return 503;
  return 500;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || "");
}

function safeMoney(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString("ar-EG", { maximumFractionDigits: 2 }) : "0";
}

async function telegramCall<T>(token: string, method: string, body: FormData | Record<string, unknown>): Promise<T> {
  if (!TOKEN_RE.test(token)) throw new Error("BOT_TOKEN_NOT_CONFIGURED");
  const isForm = body instanceof FormData;
  const response = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(25_000),
  });
  const raw = await response.text();
  let result: TelegramResult<T>;
  try { result = JSON.parse(raw) as TelegramResult<T>; }
  catch { throw new Error(`TELEGRAM_BAD_RESPONSE_${response.status}`); }
  if (!response.ok || !result.ok || result.result === undefined) {
    throw new Error(`TELEGRAM_REJECTED_${result.error_code || response.status}`);
  }
  return result.result;
}

async function getSettings(client: SupabaseClient, shopId: string): Promise<SafeSettings | null> {
  const { data, error } = await client.from("telegram_archive_settings").select("*").eq("shop_id", shopId).maybeSingle();
  if (error) throw new Error("TELEGRAM_SETTINGS_READ_FAILED");
  return data as SafeSettings | null;
}

async function getBotToken(client: SupabaseClient, shopId: string): Promise<string> {
  const { data, error } = await client.rpc("get_telegram_archive_bot_token_v1", { p_shop_id: shopId });
  if (error || typeof data !== "string" || !TOKEN_RE.test(data)) throw new Error("BOT_TOKEN_NOT_CONFIGURED");
  return data;
}

async function readSalesReceipt(client: SupabaseClient, shopId: string, invoiceId: string) {
  if (!UUID_RE.test(invoiceId)) throw new Error("INVALID_EVENT");
  const { data: invoice, error: invoiceError } = await client.from("invoices")
    .select("id,invoice_number,customer_name,customer_phone,subtotal,discount_amount,total,payment_method,created_at,created_by")
    .eq("shop_id", shopId).eq("id", invoiceId).maybeSingle();
  if (invoiceError || !invoice) throw new Error("INVOICE_NOT_FOUND");
  const { data: items, error: itemsError } = await client.from("invoice_items")
    .select("product_name_snapshot,quantity,unit_price_snapshot,line_total")
    .eq("shop_id", shopId).eq("invoice_id", invoiceId).order("created_at").limit(200);
  if (itemsError) throw new Error("INVOICE_ITEMS_READ_FAILED");
  return { invoice, items: items || [] };
}

function salesMessage(invoice: Record<string, unknown>, items: Array<Record<string, unknown>>) {
  const itemLines = items.map(row => `• ${escapeHtml(row.product_name_snapshot)} × ${escapeHtml(row.quantity)} — ${safeMoney(row.line_total)} ج.م`).join("\n") || "• لا توجد تفاصيل أصناف";
  const paymentLabels: Record<string, string> = { cash: "نقداً", card: "بطاقة", check: "شيك", bank_transfer: "تحويل بنكي", other: "أخرى" };
  return [
    "🧾 <b>إشعار بيع جديد - أبو رغوة</b>",
    `رقم الفاتورة: <b>#${escapeHtml(invoice.invoice_number)}</b>`,
    `التوقيت: ${escapeHtml(invoice.created_at)}`,
    `الكاشير: ${escapeHtml(invoice.created_by || "غير محدد")}`,
    "", "<b>الأصناف</b>", itemLines, "",
    `الإجمالي الفرعي: ${safeMoney(invoice.subtotal)} ج.م`,
    `الخصم: ${safeMoney(invoice.discount_amount)} ج.م`,
    `<b>الإجمالي: ${safeMoney(invoice.total)} ج.م</b>`,
    `الدفع: ${escapeHtml(paymentLabels[String(invoice.payment_method)] || invoice.payment_method)}`,
  ].join("\n");
}

async function processOutboxEvent(client: SupabaseClient, event: OutboxEvent) {
  const settings = await getSettings(client, event.shop_id);
  if (!settings?.is_enabled) return;
  const enabled = event.event_type === "sale_receipt" ? settings.notify_live_sales : settings.notify_low_stock;
  if (!enabled) return;
  const channelId = settings.sales_channel_id;
  if (!channelId) throw new Error("SALES_CHANNEL_NOT_CONFIGURED");
  const token = await getBotToken(client, event.shop_id);
  if (event.event_type === "sale_receipt") {
    const invoiceId = String(event.payload.invoice_id || "");
    const { invoice, items } = await readSalesReceipt(client, event.shop_id, invoiceId);
    await telegramCall(token, "sendMessage", { chat_id: channelId, text: salesMessage(invoice, items), parse_mode: "HTML", disable_web_page_preview: true });
    return;
  }
  const productId = String(event.payload.product_id || "");
  const { data: product, error } = await client.from("products").select("name,quantity,min_quantity")
    .eq("shop_id", event.shop_id).eq("id", productId).maybeSingle();
  if (error || !product) throw new Error("LOW_STOCK_PRODUCT_NOT_FOUND");
  const message = `⚠️ <b>تنبيه نقص مخزون</b>\nالصنف: ${escapeHtml(product.name)}\nالكمية الحالية: ${escapeHtml(product.quantity)}\nحد النقص: ${escapeHtml(product.min_quantity)}`;
  await telegramCall(token, "sendMessage", { chat_id: channelId, text: message, parse_mode: "HTML" });
}

export async function drainTelegramOutbox(client = adminClient(), limit = 25, shopId?: string) {
  const { data, error } = await client.rpc("claim_telegram_archive_outbox_v1", { p_shop_id: shopId || null, p_limit: Math.max(1, Math.min(50, limit)) });
  if (error) throw new Error("OUTBOX_CLAIM_FAILED");
  const events = (Array.isArray(data) ? data : []) as OutboxEvent[];
  const results = { delivered: 0, retried: 0, failed: 0 };
  for (const event of events) {
    try {
      await processOutboxEvent(client, event);
      const finished = await client.rpc("finish_telegram_archive_outbox_v1", { p_id: event.id, p_success: true, p_error: null });
      if (finished.error) throw new Error("OUTBOX_COMPLETE_FAILED");
      results.delivered += 1;
    } catch (error) {
      const raw = error instanceof Error ? error.message : "TELEGRAM_DELIVERY_FAILED";
      const sanitized = raw.replace(/\d{5,12}:[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0, 250);
      const finished = await client.rpc("finish_telegram_archive_outbox_v1", { p_id: event.id, p_success: false, p_error: sanitized });
      if (finished.error) results.failed += 1;
      else results.retried += 1;
    }
  }
  return { count: events.length, ...results };
}

async function sendDocument(token: string, channelId: string, fileName: string, bytes: Uint8Array, caption: string, mimeType: string) {
  const form = new FormData();
  form.set("chat_id", channelId);
  form.set("caption", caption.slice(0, 1024));
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  form.set("document", new Blob([copy.buffer], { type: mimeType }), fileName);
  return telegramCall<{ message_id: number; document?: { file_id?: string } }>(token, "sendDocument", form);
}

async function archiveSettingsTest(ctx: AuthContext) {
  const settings = await getSettings(ctx.client, ctx.shopId);
  if (!settings?.is_enabled) throw new Error("BOT2_DISABLED");
  const token = await getBotToken(ctx.client, ctx.shopId);
  const channels = [
    ["المبيعات", settings.sales_channel_id], ["الأرشيف", settings.archive_channel_id], ["النسخ الاحتياطي", settings.backup_channel_id],
  ] as const;
  const results: Array<{ channel: string; ok: boolean; message: string }> = [];
  for (const [label, chatId] of channels) {
    if (!chatId || !CHANNEL_ID_RE.test(chatId)) { results.push({ channel: label, ok: false, message: "معرف القناة غير مضبوط" }); continue; }
    try {
      await telegramCall(token, "sendMessage", { chat_id: chatId, text: `✅ اختبار اتصال Bot 2 - قناة ${label}\nمتجر أبو رغوة`, disable_web_page_preview: true });
      results.push({ channel: label, ok: true, message: "تم إرسال رسالة الاختبار" });
    } catch (error) {
      results.push({ channel: label, ok: false, message: error instanceof Error ? error.message : "فشل الاتصال" });
    }
  }
  return results;
}

const BACKUP_TABLES: Array<{ table: string; key: "shop_id" | "store_id"; optional?: boolean }> = [
  { table: "shops", key: "shop_id", optional: true },
  { table: "product_categories", key: "shop_id", optional: true },
  { table: "products", key: "shop_id" }, { table: "product_barcodes", key: "shop_id" }, { table: "product_images", key: "shop_id" },
  { table: "recipes", key: "shop_id" }, { table: "recipe_ingredients", key: "shop_id" }, { table: "raw_materials", key: "shop_id" }, { table: "production_runs", key: "shop_id" },
  { table: "invoices", key: "shop_id" }, { table: "invoice_items", key: "shop_id" }, { table: "stock_movements", key: "shop_id" },
  { table: "invoice_returns", key: "shop_id", optional: true }, { table: "invoice_return_items", key: "shop_id", optional: true },
  { table: "invoice_loyalty_points", key: "shop_id", optional: true }, { table: "loyalty_point_ledger", key: "shop_id", optional: true },
  { table: "loyalty_customers", key: "shop_id" }, { table: "loyalty_rewards", key: "shop_id", optional: true }, { table: "loyalty_redemptions", key: "shop_id", optional: true },
  { table: "expenses", key: "shop_id" }, { table: "bank_checks", key: "shop_id", optional: true }, { table: "deferred_check_records", key: "shop_id", optional: true },
  { table: "supplier_invoice_categories", key: "store_id", optional: true }, { table: "supplier_invoices", key: "store_id", optional: true },
  { table: "shop_credit_accounts", key: "shop_id" }, { table: "shop_credit_transactions", key: "shop_id" },
  { table: "staff_employees", key: "shop_id", optional: true }, { table: "staff_attendance", key: "shop_id", optional: true }, { table: "staff_withdrawals", key: "shop_id", optional: true },
  { table: "shortage_categories", key: "shop_id", optional: true }, { table: "shortage_items", key: "shop_id", optional: true }, { table: "shortage_manual_products", key: "shop_id", optional: true },
  { table: "catalog_settings", key: "shop_id", optional: true }, { table: "catalog_categories", key: "shop_id", optional: true }, { table: "catalog_companies", key: "shop_id", optional: true }, { table: "catalog_manual_products", key: "shop_id", optional: true }, { table: "catalog_coupons", key: "shop_id", optional: true },
  { table: "store_offers", key: "store_id", optional: true }, { table: "offer_orders", key: "store_id", optional: true },
  { table: "purchase_raffles", key: "shop_id", optional: true }, { table: "raffle_tickets", key: "shop_id", optional: true }, { table: "trivia_contests", key: "shop_id", optional: true }, { table: "trivia_entries", key: "shop_id", optional: true },
];

async function exportShopTables(client: SupabaseClient, shopId: string) {
  const tables: Record<string, unknown[]> = {};
  let rowsTotal = 0;
  for (const item of BACKUP_TABLES) {
    const rows: unknown[] = [];
    let offset = 0;
    while (true) {
      const column = item.table === "shops" ? "id" : item.key;
      const filterId = item.key === "store_id" ? shopId : shopId;
      const { data, error } = await client.from(item.table as any).select("*").eq(column, filterId).range(offset, offset + MAX_ARCHIVE_PAGE - 1);
      if (error) {
        if (item.optional && /does not exist|could not find the table|schema cache/i.test(error.message)) break;
        throw new Error(`BACKUP_TABLE_FAILED:${item.table}`);
      }
      const page = data || [];
      rows.push(...page.map((source: Record<string, unknown>) => {
        const copy = { ...source };
        for (const key of Object.keys(copy)) {
          if (/(?:password|secret|token|pin_code|pin_hash|auth_email|auth_user_id|api_key|refresh_token|access_token)/i.test(key)) delete copy[key];
        }
        return copy;
      }));
      if (page.length < MAX_ARCHIVE_PAGE) break;
      offset += MAX_ARCHIVE_PAGE;
      if (offset > 1_000_000) throw new Error(`BACKUP_ROW_LIMIT:${item.table}`);
    }
    tables[item.table] = rows;
    rowsTotal += rows.length;
  }
  const supplierInvoiceIds = (tables.supplier_invoices as Array<{ id: string }>).map(row => row.id);
  if (supplierInvoiceIds.length) {
    const rows: unknown[] = [];
    for (let offset = 0; offset < supplierInvoiceIds.length; offset += 200) {
      const ids = supplierInvoiceIds.slice(offset, offset + 200);
      const { data, error } = await client.from("supplier_invoice_items").select("*").in("invoice_id", ids).limit(10000);
      if (error) throw new Error("BACKUP_TABLE_FAILED:supplier_invoice_items");
      rows.push(...(data || []));
    }
    tables.supplier_invoice_items = rows;
    rowsTotal += rows.length;
  } else tables.supplier_invoice_items = [];
  return { tables, rowsTotal };
}

export async function createSignedBackup(client: SupabaseClient, shopId: string, token: string, channelId: string) {
  if (!CHANNEL_ID_RE.test(channelId)) throw new Error("BACKUP_CHANNEL_NOT_CONFIGURED");
  const { tables, rowsTotal } = await exportShopTables(client, shopId);
  const generatedAt = new Date().toISOString();
  const payload = { format: "abu-raghwa-shop-backup", version: 1, shopId, generatedAt, rowCount: rowsTotal, tables };
  const serialized = JSON.stringify(payload);
  const rawBytes = Buffer.from(serialized, "utf8");
  if (rawBytes.byteLength > MAX_ARCHIVE_RAW_BYTES) throw new Error("BACKUP_TOO_LARGE_UNCOMPRESSED");
  const hmacKey = supabaseConfig().key;
  const signature = createHmac("sha256", hmacKey).update(serialized).digest("hex");
  const signedEnvelope = JSON.stringify({ ...payload, integrity: { algorithm: "HMAC-SHA256", signature } });
  const archive = gzipSync(Buffer.from(signedEnvelope, "utf8"), { level: 9 });
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("BACKUP_TOO_LARGE_FOR_TELEGRAM");
  const date = generatedAt.slice(0, 10);
  const result = await sendDocument(token, channelId, `abu-raghwa-${shopId}-${date}.json.gz`, archive, `نسخة احتياطية موقعة | ${date}\n${rowsTotal.toLocaleString("ar-EG")} سجل | HMAC-SHA256`, "application/gzip");
  return { fileName: `abu-raghwa-${shopId}-${date}.json.gz`, rowCount: rowsTotal, messageId: result.message_id, signature };
}

function offerStoragePath(imageUrl: unknown, shopId: string): string | null {
  if (typeof imageUrl !== "string" || !imageUrl) return null;
  try {
    const pathname = new URL(imageUrl).pathname;
    const marker = "/storage/v1/object/public/catalog-images/";
    const index = pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(pathname.slice(index + marker.length));
    if (!path.startsWith(`${shopId}/offers/`) || path.includes("..") || path.includes("\\")) return null;
    return path;
  } catch { return null; }
}

export async function cleanupExpiredOfferBanners(client = adminClient()) {
  const offers: any[] = [];
  let offerScanComplete = false;
  for (let offset = 0; offset < 100_000; offset += 1000) {
    const { data, error } = await client.from("store_offers")
      .select("id,shop_id,status,is_active,ends_at,expires_at,deleted_at,image_url,banner_custom_image")
      .range(offset, offset + 999);
    if (error) throw new Error("EXPIRED_OFFER_SCAN_FAILED");
    offers.push(...(data || []));
    if ((data || []).length < 1000) { offerScanComplete = true; break; }
  }
  if (!offerScanComplete) throw new Error("EXPIRED_OFFER_SCAN_LIMIT_REACHED");
  const now = Date.now();
  const expired = (offers || []).filter((offer: any) => {
    const deadline = [offer.ends_at, offer.expires_at].map((value: unknown) => typeof value === "string" ? Date.parse(value) : NaN).filter(Number.isFinite);
    return offer.status === "expired" || Boolean(offer.deleted_at) || deadline.some((value: number) => value <= now);
  });
  let deleted = 0;
  for (const shopId of Array.from(new Set(expired.map((offer: any) => String(offer.shop_id || "")).filter(Boolean)))) {
    const activeRefs = new Set<string>();
    let activeScanSafe = true;
    for (let offset = 0; offset < 100_000; offset += 1000) {
      const { data: activeOffers, error: activeError } = await client.from("store_offers")
        .select("image_url,banner_custom_image").eq("shop_id", shopId).eq("is_active", true).eq("status", "active").is("deleted_at", null).range(offset, offset + 999);
      if (activeError) { activeScanSafe = false; break; }
      for (const offer of activeOffers || []) {
        for (const url of [offer.image_url, offer.banner_custom_image]) if (typeof url === "string" && url) activeRefs.add(url);
      }
      if ((activeOffers || []).length < 1000) break;
      if (offset + 1000 >= 100_000) activeScanSafe = false;
    }
    if (!activeScanSafe) continue;
    const candidates = new Map<string, string>();
    for (const offer of expired.filter((row: any) => String(row.shop_id) === shopId)) {
      for (const url of [offer.image_url, offer.banner_custom_image]) {
        const path = offerStoragePath(url, shopId);
        if (path && typeof url === "string" && !activeRefs.has(url)) candidates.set(path, url);
      }
    }
    const paths = Array.from(candidates.keys());
    for (let offset = 0; offset < paths.length; offset += 100) {
      const batch = paths.slice(offset, offset + 100);
      const { error: deleteError } = await client.storage.from("catalog-images").remove(batch);
      if (!deleteError) deleted += batch.length;
    }
  }
  return { scanned: (offers || []).length, expired: expired.length, deletedFiles: deleted };
}

export async function archiveSupplierInvoice(req: Request, res: Response) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  try {
    const input = req.body as Record<string, unknown>;
    const ctx = await authorizeShop(req, input.shopId, ["manager", "admin", "supervisor"]);
    const settings = await getSettings(ctx.client, ctx.shopId);
    if (!settings?.is_enabled || !settings.archive_channel_id) throw new Error("ARCHIVE_CHANNEL_NOT_CONFIGURED");
    const imageDataUrl = String(input.imageDataUrl || "");
    const match = imageDataUrl.match(/^data:image\/(jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error("INVALID_INVOICE_IMAGE");
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 1_800_000) throw new Error("INVOICE_IMAGE_TOO_LARGE");
    const token = await getBotToken(ctx.client, ctx.shopId);
    const form = new FormData();
    form.set("chat_id", settings.archive_channel_id);
    form.set("caption", `فاتورة مورد\nالمورد: ${String(input.supplierName || "غير محدد").slice(0,180)}\nالتاريخ: ${String(input.invoiceDate || "").slice(0,30)}\nالإجمالي: ${safeMoney(input.totalAmount)} ج.م`);
    form.set("document", new Blob([bytes], { type: "image/jpeg" }), `supplier-invoice-${randomUUID()}.jpg`);
    const sent = await telegramCall<{ message_id: number; document?: { file_id?: string }; photo?: Array<{ file_id: string }> }>(token, "sendDocument", form);
    const fileId = sent.document?.file_id || sent.photo?.at(-1)?.file_id;
    if (!fileId) throw new Error("TELEGRAM_FILE_ID_MISSING");
    const rpc = await ctx.client.rpc("save_supplier_invoice_v2", {
      p_store_id: ctx.shopId, p_category_id: (input.categoryId as string | null) || null,
      p_supplier_name: String(input.supplierName || ""), p_invoice_date: String(input.invoiceDate || ""),
      p_image_url: "", p_telegram_file_id: fileId, p_notes: String(input.notes || ""),
      p_items: input.items,
    });
    if (rpc.error) throw new Error("SUPPLIER_INVOICE_SAVE_FAILED");
    return res.status(200).json(rpc.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ARCHIVE_UPLOAD_FAILED";
    const status = safeStatus(error);
    return res.status(status).json({ error: status === 500 ? "تعذر حفظ فاتورة المورد أو أرشفتها." : message });
  }
}

export async function telegramArchiveApi(req: Request, res: Response) {
  const route = String(req.params.action || "");
  try {
    if (route === "supplier-invoice") return archiveSupplierInvoice(req, res);
    if (route === "file") return telegramInvoiceFile(req, res);
    if (route === "test") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const ctx = await authorizeShop(req, req.body?.shopId);
      const results = await archiveSettingsTest(ctx);
      return res.status(200).json({ results });
    }
    if (route === "dispatch") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const ctx = await authorizeShop(req, req.body?.shopId, ["manager", "admin", "supervisor", "seller"]);
      const result = await drainTelegramOutbox(ctx.client, 25, ctx.shopId);
      return res.status(200).json(result);
    }
    if (route === "backup-now") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const ctx = await authorizeShop(req, req.body?.shopId);
      const settings = await getSettings(ctx.client, ctx.shopId);
      if (!settings?.is_enabled || !settings.backup_channel_id) throw new Error("BACKUP_CHANNEL_NOT_CONFIGURED");
      const token = await getBotToken(ctx.client, ctx.shopId);
      const result = await createSignedBackup(ctx.client, ctx.shopId, token, settings.backup_channel_id);
      return res.status(200).json({ success: true, ...result });
    }
    return res.status(404).json({ error: "Not found" });
  } catch (error) {
    const status = safeStatus(error);
    const message = error instanceof Error ? error.message : "TELEGRAM_ARCHIVE_FAILED";
    return res.status(status).json({ error: status === 500 ? "تعذر تنفيذ العملية حالياً." : message });
  }
}

async function telegramInvoiceFile(req: Request, res: Response) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const shopId = String(req.query.shopId || "");
  const invoiceId = String(req.query.invoiceId || "");
  try {
    const ctx = await authorizeShop(req, shopId, ["manager", "admin", "supervisor"]);
    if (!UUID_RE.test(invoiceId)) return res.status(400).json({ error: "INVALID_INVOICE" });
    const { data: invoice, error } = await ctx.client.from("supplier_invoices")
      .select("id,store_id,image_url,telegram_file_id").eq("id", invoiceId).eq("store_id", shopId).maybeSingle();
    if (error || !invoice) return res.status(404).json({ error: "INVOICE_NOT_FOUND" });
    if (!invoice.telegram_file_id) {
      if (invoice.image_url) return res.redirect(302, invoice.image_url);
      return res.status(404).json({ error: "INVOICE_IMAGE_NOT_FOUND" });
    }
    const token = await getBotToken(ctx.client, shopId);
    const file = await telegramCall<{ file_path: string }>(token, "getFile", { file_id: invoice.telegram_file_id });
    if (!file.file_path || file.file_path.startsWith("/") || file.file_path.includes("..")) return res.status(502).json({ error: "TELEGRAM_FILE_PATH_INVALID" });
    const { url } = supabaseConfig();
    const download = await fetch(`${TELEGRAM_API}/file/bot${token}/${file.file_path}`, { signal: AbortSignal.timeout(25_000) });
    if (!download.ok) return res.status(502).json({ error: "TELEGRAM_FILE_DOWNLOAD_FAILED" });
    const contentType = download.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return res.status(415).json({ error: "ARCHIVE_FILE_NOT_IMAGE" });
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const bytes = Buffer.from(await download.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) return res.status(413).json({ error: "ARCHIVE_FILE_TOO_LARGE" });
    return res.status(200).send(bytes);
  } catch (error) {
    const status = safeStatus(error);
    return res.status(status).json({ error: status === 500 ? "تعذر استعادة صورة الفاتورة." : (error instanceof Error ? error.message : "ARCHIVE_FILE_FAILED") });
  }
}

export async function dailyBackupApi(req: Request, res: Response) {
  if (req.method !== "GET" && req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).json({ error: "Method not allowed" }); }
  const expected = process.env.CRON_SECRET?.trim();
  const provided = (req.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!expected || !provided || provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    return res.status(401).json({ error: "CRON_AUTH_REQUIRED" });
  }
  try {
    const client = adminClient();
    const cleanup = await cleanupExpiredOfferBanners(client);
    await drainTelegramOutbox(client, 50);
    const { data: settingsRows, error } = await client.from("telegram_archive_settings")
      .select("shop_id,backup_channel_id,is_enabled,enable_daily_backup")
      .eq("is_enabled", true).eq("enable_daily_backup", true).limit(100);
    if (error) throw new Error("BACKUP_SETTINGS_READ_FAILED");
    const results: Array<{ shopId: string; ok: boolean; error?: string }> = [];
    for (const settings of settingsRows || []) {
      try {
        const token = await getBotToken(client, settings.shop_id);
        await createSignedBackup(client, settings.shop_id, token, settings.backup_channel_id);
        results.push({ shopId: settings.shop_id, ok: true });
      } catch (error) {
        const reason = error instanceof Error ? error.message.replace(/\d{5,12}:[A-Za-z0-9_-]{20,}/g, "[redacted]").slice(0,200) : "BACKUP_FAILED";
        results.push({ shopId: settings.shop_id, ok: false, error: reason });
      }
    }
    return res.status(results.some(item => !item.ok) ? 207 : 200).json({ processed: results.length, results, cleanup });
  } catch {
    return res.status(500).json({ error: "DAILY_BACKUP_FAILED" });
  }
}
