import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

export type SupplierInvoiceItem = Database["public"]["Tables"]["supplier_invoice_items"]["Row"];
export type SupplierInvoice = Database["public"]["Tables"]["supplier_invoices"]["Row"] & { items: SupplierInvoiceItem[] };
export type SupplierInvoiceCategory = Database["public"]["Tables"]["supplier_invoice_categories"]["Row"];
export type UnlinkedSupplierInvoiceImage = { path: string; imageUrl: string; createdAt: string | null };
export type SupplierInvoiceDraftItem = {
  itemName: string;
  barcode?: string;
  quantity: number;
  unitCost: number;
  totalCost?: number;
};
export type SupplierPriceComparison = {
  itemName: string;
  supplierName: string;
  unitCost: number;
  invoiceDate: string;
  invoiceId: string;
  isCheapest: boolean;
};
export type SupplierPriceInsight = {
  previousUnitCost: number | null;
  previousSupplierName: string | null;
  priceDiff: number | null;
  cheapestUnitCost: number | null;
  cheapestSupplierName: string | null;
  savingVsCheapest: number | null;
};

function normalizeItem(item: SupplierInvoiceDraftItem) {
  const quantity = Math.max(0.001, Number(item.quantity) || 0);
  const unitCost = Math.max(0, Number(item.unitCost) || 0);
  const totalCost = Number.isFinite(Number(item.totalCost)) ? Math.max(0, Number(item.totalCost)) : quantity * unitCost;
  return {
    item_name: item.itemName.trim(),
    barcode: item.barcode?.trim() || null,
    quantity,
    unit_cost: unitCost,
    total_cost: Math.round(totalCost * 100) / 100,
  };
}

export async function uploadSupplierInvoiceImage(image: Blob): Promise<string> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("رفع فواتير الموردين متاح للمدير أو المشرف فقط.");
  if (image.type !== "image/jpeg" || image.size <= 0 || image.size > 1_800_000) throw new Error("يجب ضغط صورة الفاتورة بصيغة JPEG قبل رفعها.");
  const extension = "jpg";
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
  const base = () => client.from("supplier_invoice_items").select("unit_cost, invoice_id, supplier_invoices!inner(store_id)").eq("supplier_invoices.store_id", shopId).order("created_at", { ascending: false }).limit(1);
  if (item.barcode?.trim()) {
    const byBarcode = await base().eq("barcode", item.barcode.trim()).maybeSingle();
    if (byBarcode.error) throw new Error(byBarcode.error.message);
    if (byBarcode.data?.unit_cost != null) return Number(byBarcode.data.unit_cost);
  }
  const byName = await base().ilike("item_name", item.item_name.trim()).maybeSingle();
  if (byName.error) throw new Error(byName.error.message);
  return byName.data?.unit_cost == null ? null : Number(byName.data.unit_cost);
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
  const result = requireCloudResult(await client.rpc("save_supplier_invoice_v1", {
    p_store_id: shopId,
    p_category_id: input.categoryId || null,
    p_supplier_name: input.supplierName.trim(),
    p_invoice_date: input.invoiceDate || new Date().toISOString().slice(0, 10),
    p_image_url: input.imageUrl,
    p_notes: input.notes?.trim() || "",
    p_items: rows as unknown as Database["public"]["Functions"]["save_supplier_invoice_v1"]["Args"]["p_items"],
  }));
  if (!result || typeof result !== "object" || !("invoice" in result) || !("items" in result)) throw new Error("لم يؤكد الخادم حفظ الفاتورة وبنودها.");
  const saved = result as { invoice: Database["public"]["Tables"]["supplier_invoices"]["Row"]; items: SupplierInvoiceItem[] };
  return { ...saved.invoice, items: saved.items || [] };
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

function storagePathFromPublicUrl(url: string): string | null {
  const marker = "/storage/v1/object/public/invoices-images/";
  const index = url.indexOf(marker);
  if (index < 0) return null;
  try { return decodeURIComponent(url.slice(index + marker.length).split("?")[0]); }
  catch { return null; }
}

export async function listUnlinkedSupplierInvoiceImages(limit = 100): Promise<UnlinkedSupplierInvoiceImage[]> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  if (!["manager", "admin", "supervisor"].includes(role)) throw new Error("عرض صور فواتير الموردين متاح للمدير أو المشرف فقط.");
  const client = getSupabaseClient();
  const bucket = client.storage.from("invoices-images");
  const [filesResult, invoiceResult] = await Promise.all([
    bucket.list(shopId, { limit, sortBy: { column: "created_at", order: "desc" } }),
    client.from("supplier_invoices").select("image_url").eq("store_id", shopId).limit(2000),
  ]);
  if (filesResult.error) throw new Error(`تعذر تحميل صور الفواتير من Storage: ${filesResult.error.message}`);
  const invoices = requireCloudResult(invoiceResult) || [];
  const referenced = new Set(invoices.map(row => storagePathFromPublicUrl(row.image_url)).filter((path): path is string => Boolean(path)));
  return (filesResult.data || []).filter(file => file.id && file.metadata?.mimetype?.startsWith("image/") && !referenced.has(`${shopId}/${file.name}`)).map(file => {
    const path = `${shopId}/${file.name}`;
    return { path, imageUrl: bucket.getPublicUrl(path).data.publicUrl, createdAt: file.created_at || null };
  });
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

export async function getSupplierPriceInsights(items: Array<{ itemName: string; barcode?: string; unitCost: number }>): Promise<SupplierPriceInsight[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const client = getSupabaseClient();
  const requested = items.map(item => ({ name: item.itemName.trim().toLocaleLowerCase(), barcode: item.barcode?.trim() || "", unitCost: Number(item.unitCost) || 0 }));
  const empty = (): SupplierPriceInsight => ({ previousUnitCost: null, previousSupplierName: null, priceDiff: null, cheapestUnitCost: null, cheapestSupplierName: null, savingVsCheapest: null });
  if (!requested.some(item => item.name)) return requested.map(empty);
  const invoices = requireCloudResult(await client.from("supplier_invoices").select("id,supplier_name,created_at").eq("store_id", shopId).order("created_at", { ascending: false }).limit(2000)) || [];
  if (!invoices.length) return requested.map(empty);
  const itemRows: Array<{ invoice_id: string; item_name: string; barcode: string | null; unit_cost: number; created_at?: string }> = [];
  const invoiceIds = invoices.map(invoice => invoice.id);
  for (let offset = 0; offset < invoiceIds.length; offset += 200) {
    const rows = requireCloudResult(await client.from("supplier_invoice_items").select("invoice_id,item_name,barcode,unit_cost,created_at").in("invoice_id", invoiceIds.slice(offset, offset + 200)).order("created_at", { ascending: false }).limit(10000)) || [];
    itemRows.push(...(rows as typeof itemRows));
  }
  const invoiceMap = new Map(invoices.map(invoice => [invoice.id, invoice]));
  return requested.map(request => {
    if (!request.name) return empty();
    const matches = itemRows.filter(row => row.item_name.trim().toLocaleLowerCase() === request.name && (!request.barcode || !row.barcode || row.barcode === request.barcode));
    const previous = matches[0];
    const cheapest = matches.reduce<typeof matches[number] | null>((best, row) => !best || Number(row.unit_cost) < Number(best.unit_cost) ? row : best, null);
    const previousUnitCost = previous ? Number(previous.unit_cost) : null;
    const cheapestUnitCost = cheapest ? Number(cheapest.unit_cost) : null;
    return {
      previousUnitCost,
      previousSupplierName: previous ? invoiceMap.get(previous.invoice_id)?.supplier_name || null : null,
      priceDiff: previousUnitCost == null ? null : Math.round((request.unitCost - previousUnitCost) * 100) / 100,
      cheapestUnitCost,
      cheapestSupplierName: cheapest ? invoiceMap.get(cheapest.invoice_id)?.supplier_name || null : null,
      savingVsCheapest: cheapestUnitCost == null ? null : Math.round((request.unitCost - cheapestUnitCost) * 100) / 100,
    };
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
