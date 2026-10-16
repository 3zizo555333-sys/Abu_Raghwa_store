import type { CreateInvoiceInput, RecoverableInvoiceIntent } from "@/lib/supabase/invoices";

export type SaleType = "retail" | "wholesale" | "bulk";

export type CashierCartItem = {
  id: string;
  productId: string;
  formulationId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unit: string;
  unitName: string;
  contentUnit: string;
  saleMode: "unit" | "weight";
  bulkUnitName: string | null;
  unitsPerBulk: number;
  bulkUnitPrice: number | null;
  loyaltyPoints: number;
  prices: Record<SaleType, number>;
  points: Record<SaleType, number>;
};

export type ParkedInvoiceItem = {
  productId: string;
  formulationId?: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice?: number;
  total?: number;
};

export type ParkedInvoiceDraft = {
  id: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  saleType: SaleType;
  items: ParkedInvoiceItem[];
  cartItems?: CashierCartItem[];
  reason: string;
};

function newDraftId() {
  return globalThis.crypto?.randomUUID?.() ?? `parked-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createParkedInvoiceDraft(input: {
  items: CashierCartItem[];
  customerName: string;
  customerPhone: string;
  saleType: SaleType;
  reason: string;
  id?: string;
  createdAt?: string;
}): ParkedInvoiceDraft {
  const cartItems = input.items.map(item => ({ ...item, prices: { ...item.prices }, points: { ...item.points } }));
  return {
    id: input.id ?? newDraftId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    saleType: input.saleType,
    items: cartItems.map(item => ({
      productId: item.productId,
      ...(item.formulationId ? { formulationId: item.formulationId } : {}),
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.total,
    })),
    cartItems,
    reason: input.reason,
  };
}

export function createParkedInvoiceFromIntent(intent: RecoverableInvoiceIntent, reason: string): ParkedInvoiceDraft {
  return {
    id: intent.intentId,
    createdAt: intent.createdAt,
    customerName: intent.payload.customer_name,
    customerPhone: intent.payload.customer_phone,
    saleType: intent.payload.sale_type,
    items: intent.payload.items.map(item => ({
      productId: item.product_id,
      ...(item.formulation_id ? { formulationId: item.formulation_id } : {}),
      name: item.product_id,
      quantity: item.quantity,
      unit: item.selected_unit_type,
    })),
    reason,
  };
}

export function createInvoiceInputFromParkedDraft(draft: ParkedInvoiceDraft, idempotencyKey: string): CreateInvoiceInput {
  return {
    idempotencyKey,
    items: draft.items.map(item => ({
      productId: item.productId,
      ...(item.formulationId ? { formulationId: item.formulationId } : {}),
      quantity: item.quantity,
      selectedUnitType: item.unit,
    })),
    saleType: draft.saleType,
    paymentMethod: "cash",
    customerName: draft.customerName,
    customerPhone: draft.customerPhone,
    discountType: "fixed",
    discountValue: 0,
  };
}

export function getInsufficientStockProductName(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const match = message.match(/INSUFFICIENT_STOCK:([^\n]+)/i);
  return match?.[1]?.trim() || null;
}
