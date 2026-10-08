import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database, Json } from "./database.types";

export type InvoiceItemInput = {
  productId: string;
  quantity: number;
  selectedUnitType: string;
};
export type CreateInvoiceInput = {
  idempotencyKey: string;
  items: InvoiceItemInput[];
  saleType: "retail" | "wholesale" | "bulk";
  paymentMethod: "cash" | "card" | "check" | "bank_transfer" | "other";
  customerName?: string;
  customerPhone?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number;
};
export type CreatedInvoice = {
  invoice_id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  total: number;
  idempotent_replay: boolean;
};

export type CloudInvoiceItem = {
  productId: string;
  productName: string;
  selectedUnitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
};
export type CloudInvoice = {
  invoiceId: string;
  id: string;
  date: string;
  items: CloudInvoiceItem[];
  subTotal: number;
  discountType: "percent" | "fixed";
  discountValue: number;
  discountAmount: number;
  total: number;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
  saleType: "retail" | "wholesale" | "bulk";
  status: string;
};
export type CloudInvoicePage = { items: CloudInvoice[]; nextOffset: number | null };

type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type InvoiceItemRow = Database["public"]["Views"]["seller_invoice_items"]["Row"];

/** Make once per unsaved invoice and retain only in page memory until the server confirms it. */
export function createInvoiceIdempotencyKey(): string {
  if (!globalThis.crypto?.randomUUID) throw new Error("المتصفح لا يدعم مفاتيح الطلب الآمنة؛ حدّث المتصفح لإتمام البيع.");
  return globalThis.crypto.randomUUID();
}

export async function createCloudInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  assertCloudOnline();
  if (!input.items.length || input.items.length > 200) throw new Error("الفاتورة يجب أن تحتوي من بند واحد إلى 200 بند.");
  if (!input.items.every(item => Number.isFinite(item.quantity) && item.quantity > 0 && item.productId && item.selectedUnitType)) {
    throw new Error("توجد كمية أو وحدة غير صالحة في الفاتورة.");
  }
  const discountValue = input.discountValue ?? 0;
  if (!Number.isFinite(discountValue) || discountValue < 0 || (input.discountType === "percent" && discountValue > 100)) {
    throw new Error("قيمة الخصم غير صالحة.");
  }

  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const items = input.items.map(item => ({
    product_id: item.productId,
    quantity: item.quantity,
    selected_unit_type: item.selectedUnitType,
  })) as Json;
  const result = await supabase.rpc("create_invoice_with_stock", {
    p_shop_id: shopId,
    p_idempotency_key: input.idempotencyKey,
    p_items: items,
    p_sale_type: input.saleType,
    p_payment_method: input.paymentMethod,
    p_customer_name: input.customerName?.trim() ?? "",
    p_customer_phone: input.customerPhone?.trim() ?? "",
    p_discount_type: input.discountType ?? "fixed",
    p_discount_value: discountValue,
  });
  const data = requireCloudResult(result) as unknown as CreatedInvoice;
  if (!data.invoice_id || !data.invoice_number) throw new Error("لم يرجع الخادم تأكيدًا صالحًا للفاتورة؛ تحقق من حالة الفاتورة قبل إعادة المحاولة.");
  return data;
}

export function mapCloudInvoiceRecord(row: InvoiceRow, itemRows: InvoiceItemRow[]): CloudInvoice {
  const items = itemRows
    .filter(item => item.invoice_id === row.id)
    .map(item => ({
      productId: item.product_id ?? "",
      productName: item.product_name_snapshot,
      selectedUnitType: item.selected_unit_snapshot,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unit_price_snapshot),
      total: Number(item.line_total),
    }));
  return {
    invoiceId: row.id,
    id: row.invoice_number,
    date: row.created_at,
    items,
    subTotal: Number(row.subtotal),
    discountType: row.discount_type === "percent" ? "percent" : "fixed",
    discountValue: Number(row.discount_value),
    discountAmount: Number(row.discount_amount),
    total: Number(row.total),
    paymentMethod: row.payment_method,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    saleType: row.sale_type === "wholesale" || row.sale_type === "bulk" ? row.sale_type : "retail",
    status: row.status,
  };
}

async function getInvoiceItems(invoiceIds: string[], shopId: string, manager: boolean): Promise<InvoiceItemRow[]> {
  if (!invoiceIds.length) return [];
  const supabase = getSupabaseClient();
  const view = manager ? "manager_invoice_items" : "seller_invoice_items";
  const result = await supabase
    .from(view)
    .select("id, invoice_id, shop_id, product_id, product_name_snapshot, product_code_snapshot, selected_unit_snapshot, sale_mode_snapshot, quantity, stock_quantity_delta, unit_price_snapshot, line_total, created_at")
    .eq("shop_id", shopId)
    .in("invoice_id", invoiceIds)
    .order("created_at", { ascending: true });
  return requireCloudResult(result) as InvoiceItemRow[];
}

/** Fetches a bounded page of invoices and their seller/manager-safe line details from Supabase. */
export async function listCloudInvoices(offset = 0, pageSize = 20): Promise<CloudInvoicePage> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  const size = Math.min(Math.max(Math.floor(pageSize) || 20, 1), 50);
  const start = Math.max(0, Math.floor(offset) || 0);
  const supabase = getSupabaseClient();
  const result = await supabase
    .from("invoices")
    .select("*")
    .eq("shop_id", shopId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(start, start + size);
  const rows = requireCloudResult(result) as InvoiceRow[];
  const pageRows = rows.slice(0, size);
  const itemRows = await getInvoiceItems(pageRows.map(row => row.id), shopId, role !== "seller");
  return {
    items: pageRows.map(row => mapCloudInvoiceRecord(row, itemRows)),
    nextOffset: rows.length > size ? start + size : null,
  };
}

/** Loads an invoice by its stable database UUID; no browser storage or local invoice cache is used. */
export async function getCloudInvoice(invoiceId: string): Promise<CloudInvoice> {
  assertCloudOnline();
  const { shopId, role } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const result = await supabase.from("invoices").select("*").eq("shop_id", shopId).eq("id", invoiceId).maybeSingle();
  if (result.error) {
    requireCloudResult(result);
    throw new Error(result.error.message);
  }
  if (!result.data) throw new Error("لم نعثر على الفاتورة في السجل السحابي أو لا تملك صلاحية عرضها.");
  const row = result.data as InvoiceRow;
  const itemRows = await getInvoiceItems([row.id], shopId, role !== "seller");
  return mapCloudInvoiceRecord(row, itemRows);
}
