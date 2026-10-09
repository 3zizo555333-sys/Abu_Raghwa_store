import { describe, expect, it } from "vitest";
import { createInvoiceIdempotencyKey, mapCloudInvoiceRecord } from "./invoices";
import type { Database } from "./database.types";

describe("Supabase invoices", () => {
  it("creates unique UUID idempotency keys for page-memory retries", () => {
    const first = createInvoiceIdempotencyKey();
    const second = createInvoiceIdempotencyKey();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });

  it("maps server invoice and safe invoice-item view rows for the Arabic invoice pages", () => {
    const invoice = {
      id: "invoice-uuid",
      shop_id: "shop-uuid",
      invoice_number: "INV-20261008-001",
      idempotency_key: "key-uuid",
      status: "completed",
      sale_type: "bulk",
      payment_method: "bank_transfer",
      customer_name: "عميل",
      customer_phone: "01000000000",
      subtotal: 100,
      discount_type: "percent",
      discount_value: 10,
      discount_amount: 10,
      total: 90,
      loyalty_points_awarded: 0,
      created_by: "user-uuid",
      created_at: "2026-10-08T05:00:00.000Z",
    } as unknown as Database["public"]["Tables"]["invoices"]["Row"];
    const items = [{
      id: "line-uuid",
      invoice_id: "invoice-uuid",
      shop_id: "shop-uuid",
      product_id: "product-uuid",
      product_name_snapshot: "منظف",
      product_code_snapshot: "P-1",
      selected_unit_snapshot: "عبوة",
      sale_mode_snapshot: "unit",
      quantity: 2,
      stock_quantity_delta: 2,
      unit_price_snapshot: 50,
      line_total: 100,
      created_at: "2026-10-08T05:00:00.000Z",
    }] as unknown as Database["public"]["Views"]["seller_invoice_items"]["Row"][];

    const mapped = mapCloudInvoiceRecord(invoice, items);
    expect(mapped.invoiceId).toBe("invoice-uuid");
    expect(mapped.id).toBe("INV-20261008-001");
    expect(mapped.date).toBe(invoice.created_at);
    expect(mapped.paymentMethod).toBe("bank_transfer");
    expect(mapped.items).toEqual([{
      productId: "product-uuid",
      productName: "منظف",
      selectedUnitType: "عبوة",
      quantity: 2,
      unitPrice: 50,
      total: 100,
    }]);
    expect(mapped).not.toHaveProperty("loyaltyPointsAwarded");
    const managerItem = {
      id: "line-uuid",
      invoice_id: "invoice-uuid",
      shop_id: "shop-uuid",
      product_id: "product-uuid",
      product_name_snapshot: "منظف",
      product_code_snapshot: "P-1",
      selected_unit_snapshot: "عبوة",
      sale_mode_snapshot: "unit",
      quantity: 2,
      stock_quantity_delta: 2,
      unit_price_snapshot: 50,
      unit_cost_snapshot: 32,
      line_total: 100,
      created_at: "2026-10-08T05:00:00.000Z",
    } as unknown as Database["public"]["Views"]["manager_invoice_items"]["Row"];
    expect(mapCloudInvoiceRecord(invoice, [managerItem]).items[0]?.unitCost).toBe(32);
  });
});
