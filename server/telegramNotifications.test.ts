import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyCatalogOrder, notifyOfferPurchase } from "./telegramNotifications";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("إشعارات طلبات Telegram", () => {
  it("يرسل إشعار الكتالوج بتفاصيل الطلب وزر لوحة التحكم", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100123");
    vi.stubEnv("PUBLIC_APP_URL", "https://shop.example");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyCatalogOrder({
      id: "catalog-123",
      customerName: "عميل <اختبار>",
      customerPhone: "01000000000",
      address: "القاهرة",
      itemsJson: JSON.stringify([{ name: "صابون", quantity: 2, price: 15 }]),
      totalAmount: 25,
      couponCode: "SAVE",
      fulfillmentMethod: "delivery",
    })).resolves.toBe(true);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.chat_id).toBe("-100123");
    expect(body.parse_mode).toBe("HTML");
    expect(body.text).toContain("عميل &lt;اختبار&gt;");
    expect(body.text).toContain("صابون × 2");
    expect(body.text).toContain("الإجمالي النهائي المستحق: <b>25 ج.م</b>");
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://shop.example/catalog-manager?orderId=catalog-123");
  });

  it("يرسل تفاصيل طلب العرض ورابط لوحة العروض", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100123");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(notifyOfferPurchase({
      id: "offer-purchase-123456",
      offerTitle: "عرض منظفات",
      offerSnapshot: JSON.stringify({ title: "عرض منظفات", offerPrice: 70, originalTotalRetail: 100, items: [{ name: "مسحوق", quantity: 2, offerPrice: 35 }] }),
      customerName: "عميل",
      customerPhone: "01000000000",
      customerNote: "توصيل",
      createdAt: new Date("2026-11-06T07:00:00Z"),
    })).resolves.toBe(true);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(request.body));
    expect(body.text).toContain("شراء عرض ترويجي");
    expect(body.text).toContain("الخصم: 30 ج.م");
    expect(body.reply_markup.inline_keyboard[0][0].url).toBe("https://aburaghwastore.vercel.app/smart-offers?purchaseId=offer-purchase-123456");
  });

  it("لا يرمي خطأ عند انقطاع Telegram ولا يوقف حفظ الطلب", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-token");
    vi.stubEnv("TELEGRAM_CHAT_ID", "-100123");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    await expect(notifyCatalogOrder({
      id: "catalog-123",
      customerName: "عميل",
      customerPhone: "01000000000",
      itemsJson: "[]",
      totalAmount: 0,
    })).resolves.toBe(false);
  });
});
