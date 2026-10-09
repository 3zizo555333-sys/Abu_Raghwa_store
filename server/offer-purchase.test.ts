import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { customerLoyalty, offerPurchaseRequests } from "../drizzle/schema";
import * as db from "./db";
import { appRouter, resetStaffAccountMigrationForTests } from "./routers";

afterEach(() => {
  vi.restoreAllMocks();
  resetStaffAccountMigrationForTests();
});

describe("شراء العروض ونقاط الولاء", () => {
  it("يسجل طلب الشراء بكود الولاء فقط ولا يسمح للعميل بإرسال عدد نقاط مفروض", async () => {
    const request = { id: "offer-purchase-1234567890123456", offerTitle: "عرض مسحوق", status: "pending" as const, loyaltyPointsAwarded: 0, createdAt: new Date() };
    const create = vi.spyOn(db, "createOfferPurchaseRequest").mockResolvedValue(request);
    const caller = appRouter.createCaller({} as any);

    await expect(caller.catalog.createOfferPurchaseRequest({ offerId: "offer_123", customerCode: "a1b2" })).resolves.toEqual(request);
    expect(create).toHaveBeenCalledWith({ offerId: "offer_123", customerCode: "a1b2" });
  });

  it("يقيّد استعلام حالة طلب العرض بكود العميل والطلب معًا", async () => {
    const status = { id: "offer-purchase-1234567890123456", offerTitle: "عرض مسحوق", status: "approved" as const, loyaltyPointsAwarded: 7, createdAt: new Date() };
    const lookup = vi.spyOn(db, "getCustomerOfferPurchaseStatus").mockResolvedValue(status);
    const caller = appRouter.createCaller({} as any);

    await expect(caller.catalog.getOfferPurchaseStatus({ id: status.id, customerCode: "A1B2" })).resolves.toEqual(status);
    expect(lookup).toHaveBeenCalledWith({ id: status.id, customerCode: "A1B2" });
  });

  it("لا يسمح للعميل بقراءة صندوق الطلبات أو اعتمادها أو رفضها", async () => {
    const caller = appRouter.createCaller({} as any);
    const requestId = "offer-purchase-1234567890123456";
    await expect(caller.catalog.listOfferPurchaseRequests()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.approveOfferPurchaseRequest({ id: requestId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.cancelOfferPurchaseRequest({ id: requestId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يتيح للمدير المعتمد فقط عرض الطلب واعتماده ومنع تكرار منح النقاط عبر الواجهة", async () => {
    vi.spyOn(db, "getStaffAccounts").mockResolvedValue([]);
    vi.spyOn(db, "importStaffAccounts").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({
      key: "abu_raghwa_users",
      dataJson: JSON.stringify([{ email: "offer-manager@example.com", passwordHash: "secure-pass", role: "manager", isApproved: true }]),
      updatedAt: new Date(),
    });
    const request = { id: "offer-purchase-1234567890123456", offerTitle: "عرض مسحوق", status: "pending" as const, loyaltyPointsAwarded: 0, offerPoints: 7, customerName: "عميل", customerPhone: null, customerCode: "A1B2", offerSnapshot: "{}", offerId: "offer_123", approvedAt: null, createdAt: new Date(), updatedAt: new Date() };
    const list = vi.spyOn(db, "listOfferPurchaseRequests").mockResolvedValue([request] as any);
    const approve = vi.spyOn(db, "approveOfferPurchaseRequest").mockResolvedValue({ success: true, alreadyApproved: false, awardedPoints: 7, customerCode: "A1B2" });
    const refuse = vi.spyOn(db, "cancelOfferPurchaseRequest").mockResolvedValue({ success: true, status: "cancelled" });
    const manager = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: () => undefined } } as any);
    const login = await manager.catalog.login({ managerEmail: "offer-manager@example.com", managerPassword: "secure-pass" });
    const sessionCaller = appRouter.createCaller({ req: { headers: { "x-abu-catalog-session": login.token } }, res: {} } as any);

    await expect(sessionCaller.catalog.listOfferPurchaseRequests()).resolves.toEqual([request]);
    await expect(sessionCaller.catalog.approveOfferPurchaseRequest({ id: request.id })).resolves.toEqual({ success: true, alreadyApproved: false, awardedPoints: 7, customerCode: "A1B2" });
    await expect(sessionCaller.catalog.cancelOfferPurchaseRequest({ id: request.id })).resolves.toEqual({ success: true, status: "cancelled" });
    expect(list).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith(request.id);
    expect(refuse).toHaveBeenCalledWith(request.id);
  }, 15_000);

  it("يتيح للبائع المعتمد اعتماد طلب شراء العرض", async () => {
    vi.spyOn(db, "getStaffAccounts").mockResolvedValue([]);
    vi.spyOn(db, "importStaffAccounts").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue({
      key: "abu_raghwa_users",
      dataJson: JSON.stringify([{ email: "offer-seller@example.com", passwordHash: "seller-pass", role: "seller", isApproved: true }]),
      updatedAt: new Date(),
    });
    const request = { id: "offer-purchase-1234567890123456", offerTitle: "عرض مسحوق", status: "pending" as const, loyaltyPointsAwarded: 0, offerPoints: 7, customerName: "عميل", customerPhone: null, customerCode: "A1B2", offerSnapshot: "{}", offerId: "offer_123", approvedAt: null, createdAt: new Date(), updatedAt: new Date() };
    const list = vi.spyOn(db, "listOfferPurchaseRequests").mockResolvedValue([request] as any);
    const approve = vi.spyOn(db, "approveOfferPurchaseRequest").mockResolvedValue({ success: true, alreadyApproved: false, awardedPoints: 7, customerCode: "A1B2" });
    const refuse = vi.spyOn(db, "cancelOfferPurchaseRequest").mockResolvedValue({ success: true, status: "cancelled" });
    const manager = appRouter.createCaller({ req: { protocol: "https", headers: {} }, res: { cookie: () => undefined } } as any);
    const login = await manager.catalog.login({ managerEmail: "offer-seller@example.com", managerPassword: "seller-pass" });
    const sessionCaller = appRouter.createCaller({ req: { headers: { "x-abu-catalog-session": login.token } }, res: {} } as any);

    await expect(sessionCaller.catalog.listOfferPurchaseRequests()).resolves.toEqual([request]);
    await expect(sessionCaller.catalog.approveOfferPurchaseRequest({ id: request.id })).resolves.toMatchObject({ awardedPoints: 7 });
    await expect(sessionCaller.catalog.cancelOfferPurchaseRequest({ id: request.id })).resolves.toEqual({ success: true, status: "cancelled" });
    expect(list).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith(request.id);
    expect(refuse).toHaveBeenCalledWith(request.id);
  }, 15_000);

  it.skipIf(!process.env.DATABASE_URL)("لا يمنح نقاطًا عند التسجيل؛ يضيفها مرة واحدة بعد اعتماد الطلب، ولا يضيفها للطلب المرفوض", async () => {
    const suffix = randomUUID().replace(/-/g, "");
    const offerId = `purchase-test-${suffix}`;
    const cancelledOfferId = `cancel-test-${suffix}`;
    let customerCode = "";
    const database = await db.getDb();
    if (!database) throw new Error("The test database was expected to be configured");
    try {
      await db.saveSharedOffer(offerId, JSON.stringify({ id: offerId, title: "عرض اختبار", strategyName: "اختبار", items: [{ name: "منتج اختبار", offerPrice: 25 }], offerPrice: 25, loyaltyPoints: 9, isActivated: true, startAt: Date.now() - 60_000, endAt: Date.now() + 3_600_000 }));
      await db.saveSharedOffer(cancelledOfferId, JSON.stringify({ id: cancelledOfferId, title: "عرض ملغي", items: [{ name: "منتج" }], offerPrice: 10, loyaltyPoints: 4, isActivated: true, endAt: Date.now() + 3_600_000 }));
      const profile = await db.registerOfferCustomer({ name: `عميل اختبار ${suffix.slice(0, 8)}` });
      if (!profile) throw new Error("Expected a loyalty profile to be created");
      customerCode = profile.customerCode;
      expect(profile.points).toBe(0);

      const pending = await db.createOfferPurchaseRequest({ offerId, customerCode });
      const duplicate = await db.createOfferPurchaseRequest({ offerId, customerCode });
      expect(pending.status).toBe("pending");
      expect(duplicate.id).toBe(pending.id);
      expect((await db.getCustomerLoyaltyProfile({ customerCode }))?.points).toBe(0);

      await expect(db.approveOfferPurchaseRequest(pending.id)).resolves.toMatchObject({ awardedPoints: 9, alreadyApproved: false });
      await expect(db.approveOfferPurchaseRequest(pending.id)).resolves.toMatchObject({ awardedPoints: 9, alreadyApproved: true });
      const afterApproval = await db.getCustomerLoyaltyProfile({ customerCode });
      expect(afterApproval?.points).toBe(9);
      expect(afterApproval?.transactions?.filter(transaction => transaction.id === `offer-purchase:${pending.id}:earned`)).toHaveLength(1);

      const cancelled = await db.createOfferPurchaseRequest({ offerId: cancelledOfferId, customerCode });
      await db.cancelOfferPurchaseRequest(cancelled.id);
      await expect(db.approveOfferPurchaseRequest(cancelled.id)).rejects.toThrow("لا يمكن تأكيد طلب مرفوض أو ملغى");
      expect((await db.getCustomerLoyaltyProfile({ customerCode }))?.points).toBe(9);
    } finally {
      if (customerCode) {
        await database.delete(offerPurchaseRequests).where(eq(offerPurchaseRequests.customerCode, customerCode));
        await database.delete(customerLoyalty).where(eq(customerLoyalty.customerCode, customerCode));
      }
      await db.deleteSharedOffer(offerId);
      await db.deleteSharedOffer(cancelledOfferId);
    }
  }, 20_000);

  it.skipIf(!process.env.DATABASE_URL)("يحفظ عدة عروض معًا ولا يحذف إلا العرض الذي يختاره المدير يدويًا", async () => {
    const prefix = `multi-offer-test-${randomUUID().replace(/-/g, "")}`;
    const ids = [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`];
    try {
      await Promise.all(ids.map((id, index) => db.saveSharedOffer(id, JSON.stringify({ id, title: `عرض ${index + 1}`, isActivated: true }))));
      const before = await db.listSharedOffers();
      for (const id of ids) expect(before?.some(offer => offer.id === id)).toBe(true);

      await db.deleteSharedOffer(ids[1]);
      const after = await db.listSharedOffers();
      expect(after?.some(offer => offer.id === ids[0])).toBe(true);
      expect(after?.some(offer => offer.id === ids[1])).toBe(false);
      expect(after?.some(offer => offer.id === ids[2])).toBe(true);
    } finally {
      await Promise.all(ids.map(id => db.deleteSharedOffer(id)));
    }
  }, 20_000);
});
