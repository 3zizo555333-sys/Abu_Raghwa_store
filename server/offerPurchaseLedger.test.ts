import { describe, expect, it } from "vitest";
import { planOfferPurchaseLedgerUpdate } from "./offerPurchaseLedger";

describe("سجل نقاط شراء العرض", () => {
  const base = { requestId: "offer-purchase-123", offerId: "offer-1", customerCode: "A1B2", offerTitle: "عرض منظفات", offerPoints: 8, currentPoints: 12, transactionsJson: "[]", usedCouponsJson: "[]", now: "2026-09-29T00:00:00.000Z" };

  it("لا يضيف نقاطًا إلا عند استدعائه من مسار اعتماد طلب الشراء", () => {
    const result = planOfferPurchaseLedgerUpdate(base);
    expect(result.points).toBe(20);
    expect(result.awardedPoints).toBe(8);
    expect(JSON.parse(result.transactionsJson)).toMatchObject([{ id: "offer-purchase:offer-purchase-123:earned", points: 8, type: "earned", source: "offer", orderId: "offer-purchase-123" }]);
    expect(JSON.parse(result.usedCouponsJson)).toEqual(["offer-1"]);
  });

  it("يجعل إعادة الاعتماد آمنة ولا يضاعف النقاط أو سجل الحركة", () => {
    const once = planOfferPurchaseLedgerUpdate(base);
    const twice = planOfferPurchaseLedgerUpdate({ ...base, currentPoints: once.points, transactionsJson: once.transactionsJson, usedCouponsJson: once.usedCouponsJson });
    expect(twice.points).toBe(20);
    expect(twice.awardedPoints).toBe(8);
    expect(JSON.parse(twice.transactionsJson)).toHaveLength(1);
    expect(JSON.parse(twice.usedCouponsJson)).toEqual(["offer-1"]);
  });

  it("يؤكد بيع عرض بلا نقاط دون تغيير الرصيد", () => {
    const result = planOfferPurchaseLedgerUpdate({ ...base, offerPoints: 0 });
    expect(result.points).toBe(12);
    expect(result.awardedPoints).toBe(0);
    expect(JSON.parse(result.transactionsJson)).toEqual([]);
    expect(JSON.parse(result.usedCouponsJson)).toEqual(["offer-1"]);
  });

  it("يتعامل بأمان مع بيانات سجل تالفة ويمنع الرصيد السالب", () => {
    const result = planOfferPurchaseLedgerUpdate({ ...base, currentPoints: -9, transactionsJson: "bad-json", usedCouponsJson: "bad-json" });
    expect(result.points).toBe(8);
    expect(JSON.parse(result.transactionsJson)).toHaveLength(1);
    expect(JSON.parse(result.usedCouponsJson)).toEqual(["offer-1"]);
  });

  it("لا يضيف نقاطًا مرة أخرى إذا كانت البطاقة تحمل حركة اكتساب قديمة لهذا الكوبون", () => {
    const legacyTransaction = { id: "offer:offer-1:A1B2", points: 8, type: "earned", source: "offer", description: "نقاط كوبون قديم", createdAt: "2026-01-01T00:00:00.000Z" };
    const result = planOfferPurchaseLedgerUpdate({ ...base, currentPoints: 20, transactionsJson: JSON.stringify([legacyTransaction]) });
    expect(result.points).toBe(20);
    expect(result.awardedPoints).toBe(0);
    expect(JSON.parse(result.transactionsJson)).toHaveLength(1);
  });
});
