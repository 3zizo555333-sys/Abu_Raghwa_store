import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import { prepareCloudProductImage } from "./prepareProductImage";
import type { Database } from "./database.types";

export type SupplierInvoiceItem = Database["public"]["Tables"]["supplier_invoice_items"]["Row"];
export type SupplierInvoice = Database["public"]["Tables"]["supplier_invoices"]["Row"] & { items: SupplierInvoiceItem[] };
export type SupplierInvoiceCategory = Database["public"]["Tables"]["supplier_invoice_categories"]["Row"];
export type SupplierInvoiceDraftItem = {
  itemName: string;
  barcode?: string;
  quantity: number;
  unitCost: number;
};
export type SupplierPriceComparison = {
  itemName: string;
  supplierName: string;
  unitCost: number;
  invoiceDate: string;
  invoiceId: string;
  isCheapest: boolean;
};

function normalizeItem(item: SupplierInvoiceDraftItem) {
  const quantity = Math.max(0.001, Number(item.quantity) || 0);
  const unitCost = Math.max(0, Number(item.unitCost) || 0);
  return {
    item_name: item.itemName.trim(),
    barcode: item.barcode?.trim() || null,
    quantity,
    unit_cost: unitCost,
    total_cost: Math.round(quantity * unitCost * 100) / 100,
  };
}

export async function uploadSupplierInvoiceImage(file: File): Promise<string> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("رفع فواتير الموردين متاح للمدير أو المشرف فقط.");
  const image = await prepareCloudProductImage(file, { allowJpegFallback: true });
  const extension = image.type === "image/png" ? "png" : image.type === "image/webp" ? "webp" : "jpg";
  const path = `${shopId}/${crypto.randomUUID()}.${extension}`;
  const bucket = getSupabaseClient().storage.from("invoices-images");
  try {
    const upload = await bucket.upload(path, image, { contentType: image.type, cacheControl: "31536000", upsert: false });
    if (upload.error) throw new Error(`فشل رفع صورة الفاتورة إلى invoices-images: ${upload.error.message}`);
    const publicUrl = bucket.getPublicUrl(path).data.publicUrl;
    if (!publicUrl) throw new Error("لم يُرجع Supabase رابط الصورة المرفوعة.");
    return publicUrl;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "تعذر رفع صورة الفاتورة إلى Supabase Storage.");
  }
}
export async function listSupplierInvoiceCategories(): Promise<SupplierInvoiceCategory[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  return (requireCloudResult(await getSupabaseClient().from("supplier_invoice_categories").select("*").eq("store_id", shopId).order("name").limit(500)) || []) as SupplierInvoiceCategory[];
}
export async function createSupplierInvoiceCategory(name: string): Promise<SupplierInvoiceCategory> {
  assertCloudOnline();
  const normalized = name.trim();
  if (!normalized || normalized.length > 120) throw new Error("اسم الفئة مطلوب ويجب ألا يتجاوز 120 حرفاً.");
  const { shopId, role } = await getActiveShopContext(true);
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("إضافة الفئات متاحة للمدير أو المشرف فقط.");
  return requireCloudResult(await getSupabaseClient().from("supplier_invoice_categories").insert({ store_id: shopId, name: normalized }).select("*").single()) as SupplierInvoiceCategory;
}

async function getPreviousCost(shopId: string, item: { item_name: string; barcode?: string | null }) {
  const client = getSupabaseClient();
  let query = client.from("supplier_invoice_items").select("unit_cost, invoice_id, supplier_invoices!inner(store_id)").eq("supplier_invoices.store_id", shopId).ilike("item_name", item.item_name.trim()).order("created_at", { ascending: false }).limit(1);
  if (item.barcode?.trim()) query = query.or(`barcode.eq.${item.barcode.trim()},item_name.ilike.${item.item_name.trim()}`);
  const result = await query.maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.unit_cost == null ? null : Number(result.data.unit_cost);
}

export async function saveSupplierInvoice(input: { supplierName: string; invoiceDate: string; imageUrl: string; categoryId?: string | null; notes?: string; items: SupplierInvoiceDraftItem[] }): Promise<SupplierInvoice> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true);
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("حفظ فواتير الموردين متاح للمدير أو المشرف فقط.");
  const client = getSupabaseClient();
  const normalized = input.items.filter(item => item.itemName.trim()).map(normalizeItem);
  if (!input.supplierName.trim() || !input.imageUrl || !normalized.length) throw new Error("أدخل المورد والصورة وبنداً واحداً على الأقل.");
  const previousCosts = await Promise.all(normalized.map(item => getPreviousCost(shopId, item)));
  const rows = normalized.map((item, index) => {
    const previous = previousCosts[index];
    const diff = previous == null ? null : Math.round((item.unit_cost - previous) * 10000) / 10000;
    return { ...item, previous_cost: previous, price_diff: diff, price_direction: diff == null || Math.abs(diff) < 0.0001 ? "stable" : diff > 0 ? "up" : "down" as "up" | "down" | "stable" };
  });
  const totalAmount = rows.reduce((sum, row) => sum + row.total_cost, 0);
  const invoice = requireCloudResult(await client.from("supplier_invoices").insert({ store_id: shopId, category_id: input.categoryId || null, supplier_name: input.supplierName.trim(), invoice_date: input.invoiceDate || new Date().toISOString().slice(0, 10), image_url: input.imageUrl, total_amount: Math.round(totalAmount * 100) / 100, notes: input.notes?.trim() || "" }).select("*").single()) as Database["public"]["Tables"]["supplier_invoices"]["Row"];
  if (!invoice) throw new Error("لم يؤكد الخادم إنشاء الفاتورة.");
  const items = requireCloudResult(await client.from("supplier_invoice_items").insert(rows.map(row => ({ ...row, invoice_id: invoice.id }))).select("*")) as SupplierInvoiceItem[] | null;
  return { ...invoice, items: items || [] } as SupplierInvoice;
}

export async function listSupplierInvoices(limit = 100): Promise<SupplierInvoice[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const client = getSupabaseClient();
  const invoices = requireCloudResult(await client.from("supplier_invoices").select("*").eq("store_id", shopId).order("invoice_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit));
  if (!invoices?.length) return [];
  const items = requireCloudResult(await client.from("supplier_invoice_items").select("*").in("invoice_id", invoices.map(invoice => invoice.id)).order("created_at")).map(row => row as SupplierInvoiceItem);
  return invoices.map(invoice => ({ ...invoice, items: items.filter(item => item.invoice_id === invoice.id) }));
}

export async function deleteSupplierInvoice(invoiceId: string): Promise<void> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext(true);
  if (role !== "manager" && role !== "admin") throw new Error("حذف فواتير الموردين متاح للمدير فقط.");
  requireCloudResult(await getSupabaseClient().from("supplier_invoices").delete().eq("id", invoiceId).eq("store_id", shopId).select("id").single());
}

export async function listSupplierPriceHistory(itemName: string, barcode?: string): Promise<SupplierPriceComparison[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const client = getSupabaseClient();
  const invoiceRows = requireCloudResult(await client.from("supplier_invoices").select("id,supplier_name,invoice_date").eq("store_id", shopId).order("invoice_date", { ascending: false }).limit(1000));
  if (!invoiceRows?.length) return [];
  const itemResult = await client.from("supplier_invoice_items").select("invoice_id,item_name,barcode,unit_cost").in("invoice_id", invoiceRows.map(row => row.id)).ilike("item_name", itemName.trim()).limit(1000);
  const items = requireCloudResult(itemResult) || [];
  const matching = barcode?.trim() ? items.filter(item => item.barcode === barcode.trim() || item.item_name.toLocaleLowerCase() === itemName.trim().toLocaleLowerCase()) : items;
  const cheapest = Math.min(...matching.map(row => Number(row.unit_cost)));
  return matching.map(row => {
    const invoice = invoiceRows.find(candidate => candidate.id === row.invoice_id);
    return { itemName: row.item_name, supplierName: invoice?.supplier_name || "", unitCost: Number(row.unit_cost), invoiceDate: invoice?.invoice_date || "", invoiceId: row.invoice_id, isCheapest: Number(row.unit_cost) === cheapest };
  });
}

export function subscribeToSupplierInvoiceRealtime(shopId: string, onChange: () => void) {
  const client = getSupabaseClient();
  const channel = client.channel(`supplier-invoices:${shopId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "supplier_invoices", filter: `store_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "supplier_invoice_items" }, onChange)
    .subscribe();
  return () => { void client.removeChannel(channel); };
}
