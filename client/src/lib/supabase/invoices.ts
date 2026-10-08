import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Json } from "./database.types";

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
