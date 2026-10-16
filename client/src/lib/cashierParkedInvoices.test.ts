import { describe, expect, it } from "vitest";
import {
  createInvoiceInputFromParkedDraft,
  createParkedInvoiceDraft,
  createParkedInvoiceFromIntent,
  getInsufficientStockProductName,
  type CashierCartItem,
} from "./cashierParkedInvoices";
import type { RecoverableInvoiceIntent } from "./invoices";

const cartItem: CashierCartItem = {
  id: "product-1::قطعة",
  productId: "product-1",
  name: "٥ سلك",
  quantity: 4,
  unitPrice: 12,
  total: 48,
  unit: "قطعة",
  unitName: "عبوة",
  contentUnit: "قطعة",
  saleMode: "unit",
  bulkUnitName: null,
  unitsPerBulk: 1,
  bulkUnitPrice: null,
  loyaltyPoints: 0,
  prices: { retail: 12, wholesale: 12, bulk: 12 },
  points: { retail: 0, wholesale: 0, bulk: 0 },
};

describe("فواتير الكاشير المعلقة", () => {
  it("يحفظ نسخة مستقلة من السلة وبيانات العميل ويعيد بناء طلب جديد بمفتاح جديد", () => {
    const draft = createParkedInvoiceDraft({
      items: [cartItem],
      customerName: "عميل",
      customerPhone: "01000000000",
      saleType: "retail",
      reason: "انقطاع الاتصال",
      id: "draft-1",
      createdAt: "2026-10-15T16:00:00.000Z",
    });
    const request = createInvoiceInputFromParkedDraft(draft, "retry-key");
    expect(draft.items[0]).toMatchObject({ name: "٥ سلك", quantity: 4, unit: "قطعة" });
    expect(request).toMatchObject({ idempotencyKey: "retry-key", customerName: "عميل", customerPhone: "01000000000" });
    expect(request.items).toEqual([{ productId: "product-1", quantity: 4, selectedUnitType: "قطعة" }]);
    expect(draft.cartItems?.[0]?.total).toBe(48);
  });

  it("يحول محاولة خادم معلقة إلى مسودة قابلة لإعادة المحاولة دون أسعار مزيفة", () => {
    const intent: RecoverableInvoiceIntent = {
      intentId: "intent-1",
      state: "pending",
      payload: {
        items: [{ product_id: "product-1", quantity: 4, selected_unit_type: "قطعة" }],
        sale_type: "retail",
        payment_method: "cash",
        customer_name: "عميل",
        customer_phone: "",
        discount_type: "fixed",
        discount_value: 0,
      },
      invoiceResult: null,
      createdAt: "2026-10-15T16:00:00.000Z",
    };
    const draft = createParkedInvoiceFromIntent(intent, "تعذر تأكيد الحفظ");
    expect(draft.id).toBe("intent-1");
    expect(draft.cartItems).toBeUndefined();
    expect(draft.items[0]).toMatchObject({ productId: "product-1", quantity: 4 });
    expect(draft.items[0]).not.toHaveProperty("unitPrice");
    expect(createInvoiceInputFromParkedDraft(draft, "new-key").items[0]?.quantity).toBe(4);
  });

  it("يستخرج اسم الصنف من خطأ المخزون ويخفي بقية تفاصيل الخطأ", () => {
    expect(getInsufficientStockProductName(new Error("INSUFFICIENT_STOCK:٥ سلك"))).toBe("٥ سلك");
    expect(getInsufficientStockProductName(new Error("network timeout"))).toBeNull();
  });
});
