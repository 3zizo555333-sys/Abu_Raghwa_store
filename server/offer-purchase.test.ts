import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import * as db from "./db";
import { appRouter, resetStaffAccountMigrationForTests } from "./routers";
import { signCatalogAdminToken } from "./catalogAdminSession";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  resetStaffAccountMigrationForTests();
});

const shopId = "123e4567-e89b-12d3-a456-426614174000";
const authUserId = "123e4567-e89b-12d3-a456-426614174002";
async function localOfferCaller(role = "manager", tokenShopId = shopId) {
  vi.stubEnv("JWT_SECRET", "test-catalog-admin-signing-key-with-32-chars-minimum");
  const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: { shop_id: tokenShopId, role, status: "active" }, error: null })) };
  vi.spyOn(db, "getSupabaseServiceRoleClient").mockReturnValue({ from: vi.fn(() => query) } as any);
  const token = await signCatalogAdminToken({ purpose: "catalog-admin", authType: "local-pin", sub: authUserId, shopId: tokenShopId, scope: "offers", role, featureKey: "screen__smart_offers" });
  return appRouter.createCaller({ req: { headers: { "x-abu-catalog-session": token } }, res: {} } as any);
}

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
    const caller = appRouter.createCaller({ req: { headers: {} } } as any);
    const requestId = "offer-purchase-1234567890123456";
    await expect(caller.catalog.listOfferPurchaseRequests({ shopId, authUserId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.approveOfferPurchaseRequest({ id: requestId, shopId, authUserId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.catalog.cancelOfferPurchaseRequest({ id: requestId, shopId, authUserId })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
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
    const sessionCaller = await localOfferCaller();

    await expect(sessionCaller.catalog.listOfferPurchaseRequests({ shopId, authUserId })).resolves.toEqual([request]);
    await expect(sessionCaller.catalog.approveOfferPurchaseRequest({ id: request.id, shopId, authUserId })).resolves.toEqual({ success: true, alreadyApproved: false, awardedPoints: 7, customerCode: "A1B2" });
    await expect(sessionCaller.catalog.cancelOfferPurchaseRequest({ id: request.id, shopId, authUserId })).resolves.toEqual({ success: true, status: "cancelled" });
    expect(list).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith(request.id, shopId);
    expect(refuse).toHaveBeenCalledWith(request.id, shopId);
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
    const sessionCaller = await localOfferCaller("seller");

    await expect(sessionCaller.catalog.listOfferPurchaseRequests({ shopId, authUserId })).resolves.toEqual([request]);
    await expect(sessionCaller.catalog.approveOfferPurchaseRequest({ id: request.id, shopId, authUserId })).resolves.toMatchObject({ awardedPoints: 7 });
    await expect(sessionCaller.catalog.cancelOfferPurchaseRequest({ id: request.id, shopId, authUserId })).resolves.toEqual({ success: true, status: "cancelled" });
    expect(list).toHaveBeenCalledOnce();
    expect(approve).toHaveBeenCalledWith(request.id, shopId);
    expect(refuse).toHaveBeenCalledWith(request.id, shopId);
  }, 15_000);

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
