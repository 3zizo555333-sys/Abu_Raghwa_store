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

export type RecoverableInvoiceIntent = {
  intentId: string;
  state: "pending" | "completed" | "acknowledged" | "cancelled";
  payload: {
    items: Array<{ product_id: string; quantity: number; selected_unit_type: string }>;
    sale_type: "retail" | "wholesale" | "bulk";
    payment_method: "cash" | "card" | "check" | "bank_transfer" | "other";
    customer_name: string;
    customer_phone: string;
    discount_type: "percent" | "fixed";
    discount_value: number;
  };
  invoiceResult: CreatedInvoice | null;
  createdAt: string;
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

type JsonObject = { [key: string]: Json | undefined };

function asJsonObject(value: Json | undefined, label: string): JsonObject {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`استجابة Supabase غير صالحة: ${label}.`);
  }
  return value;
}

function parseCreatedInvoice(value: Json | undefined): CreatedInvoice {
  const row = asJsonObject(value, "invoice result");
  const invoiceId = row.invoice_id;
  const invoiceNumber = row.invoice_number;
  const subtotal = row.subtotal;
  const discountAmount = row.discount_amount;
  const total = row.total;
  const replay = row.idempotent_replay;
  if (typeof invoiceId !== "string" || typeof invoiceNumber !== "string"
      || typeof subtotal !== "number" || typeof discountAmount !== "number"
      || typeof total !== "number" || typeof replay !== "boolean") {
    throw new Error("لم يرجع الخادم تأكيدًا صالحًا للفاتورة؛ تحقّق من حالتها قبل إعادة المحاولة.");
  }
  return {
    invoice_id: invoiceId,
    invoice_number: invoiceNumber,
    subtotal,
    discount_amount: discountAmount,
    total,
    idempotent_replay: replay,
  };
}

function parseInvoiceIntent(value: Json): RecoverableInvoiceIntent {
  const row = asJsonObject(value, "invoice intent");
  const intentId = row.intent_id;
  const state = row.state;
  const createdAt = row.created_at;
  const payload = asJsonObject(row.payload, "invoice intent payload");
  const items = payload.items;
  const saleType = payload.sale_type;
  const paymentMethod = payload.payment_method;
  const customerName = payload.customer_name;
  const customerPhone = payload.customer_phone;
  const discountType = payload.discount_type;
  const discountValue = payload.discount_value;
  if (typeof intentId !== "string" || typeof createdAt !== "string"
      || (state !== "pending" && state !== "completed" && state !== "acknowledged" && state !== "cancelled")
      || !Array.isArray(items)
      || (saleType !== "retail" && saleType !== "wholesale" && saleType !== "bulk")
      || (paymentMethod !== "cash" && paymentMethod !== "card" && paymentMethod !== "check" && paymentMethod !== "bank_transfer" && paymentMethod !== "other")
      || typeof customerName !== "string" || typeof customerPhone !== "string"
      || (discountType !== "percent" && discountType !== "fixed") || typeof discountValue !== "number") {
    throw new Error("تعذر قراءة محاولة الفاتورة المحفوظة بأمان.");
  }
  const parsedItems = items.map(item => {
    const entry = asJsonObject(item, "invoice intent item");
    const productId = entry.product_id;
    const quantity = entry.quantity;
    const selectedUnitType = entry.selected_unit_type;
    if (typeof productId !== "string" || typeof quantity !== "number" || !Number.isFinite(quantity)
        || typeof selectedUnitType !== "string") {
      throw new Error("محاولة الفاتورة المحفوظة تحتوي بندًا غير صالح.");
    }
    return { product_id: productId, quantity, selected_unit_type: selectedUnitType };
  });
  const invoiceResult = row.invoice_result === undefined || row.invoice_result === null
    ? null
    : parseCreatedInvoice(row.invoice_result);
  return {
    intentId,
    state,
    payload: {
      items: parsedItems,
      sale_type: saleType,
      payment_method: paymentMethod,
      customer_name: customerName,
      customer_phone: customerPhone,
      discount_type: discountType,
      discount_value: discountValue,
    },
    invoiceResult,
    createdAt,
  };
}

function validateInvoiceInput(input: CreateInvoiceInput): void {
  if (!input.items.length || input.items.length > 200) throw new Error("الفاتورة يجب أن تحتوي من بند واحد إلى 200 بند.");
  if (!input.items.every(item => Number.isFinite(item.quantity) && item.quantity > 0 && item.productId && item.selectedUnitType)) {
    throw new Error("توجد كمية أو وحدة غير صالحة في الفاتورة.");
  }
  const discountValue = input.discountValue ?? 0;
  if (!Number.isFinite(discountValue) || discountValue < 0 || (input.discountType === "percent" && discountValue > 100)) {
    throw new Error("قيمة الخصم غير صالحة.");
  }
}

export async function createInvoiceIntent(input: CreateInvoiceInput): Promise<RecoverableInvoiceIntent> {
  assertCloudOnline();
  validateInvoiceInput(input);
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const payload: Json = {
    items: input.items.map(item => ({
      product_id: item.productId,
      quantity: item.quantity,
      selected_unit_type: item.selectedUnitType,
    })),
    sale_type: input.saleType,
    payment_method: input.paymentMethod,
    customer_name: input.customerName?.trim() ?? "",
    customer_phone: input.customerPhone?.trim() ?? "",
    discount_type: input.discountType ?? "fixed",
    discount_value: input.discountValue ?? 0,
  };
  const result = await supabase.rpc("create_invoice_intent", {
    p_shop_id: shopId,
    p_idempotency_key: input.idempotencyKey,
    p_payload: payload,
  });
  return parseInvoiceIntent(requireCloudResult(result));
}

export async function getRecoverableInvoiceIntent(): Promise<RecoverableInvoiceIntent | null> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("get_recoverable_invoice_intent", { p_shop_id: shopId });
  if (result.error) requireCloudResult(result);
  return result.data === null ? null : parseInvoiceIntent(result.data);
}

export async function completeInvoiceIntent(intentId: string): Promise<CreatedInvoice> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("complete_invoice_intent", { p_shop_id: shopId, p_intent_id: intentId });
  return parseCreatedInvoice(requireCloudResult(result));
}

export async function acknowledgeInvoiceIntent(intentId: string): Promise<CreatedInvoice> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("acknowledge_invoice_intent", { p_shop_id: shopId, p_intent_id: intentId });
  return parseCreatedInvoice(requireCloudResult(result));
}

export async function cancelPendingInvoiceIntent(intentId: string): Promise<void> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const { shopId } = await getActiveShopContext();
  const result = await supabase.rpc("cancel_pending_invoice_intent", { p_shop_id: shopId, p_intent_id: intentId });
  const data = asJsonObject(requireCloudResult(result), "invoice intent cancellation");
  if (data.state !== "cancelled") throw new Error("لم يؤكد الخادم إلغاء محاولة الفاتورة.");
}

export async function createCloudInvoice(input: CreateInvoiceInput): Promise<CreatedInvoice> {
  const intent = await createInvoiceIntent(input);
  if (intent.state === "cancelled") throw new Error("تم إلغاء محاولة هذه الفاتورة؛ ابدأ محاولة بيع جديدة.");
  let created: CreatedInvoice;
  if ((intent.state === "completed" || intent.state === "acknowledged") && intent.invoiceResult) {
    created = intent.invoiceResult;
  } else {
    created = await completeInvoiceIntent(intent.intentId);
  }
  if (intent.state !== "acknowledged") await acknowledgeInvoiceIntent(intent.intentId);
  return created;
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
