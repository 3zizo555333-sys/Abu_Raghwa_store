import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const manager = {
  id: "manager-1",
  email: "offers-manager@example.com",
  passwordHash: "not-used-by-signed-session-test",
  role: "manager" as const,
  status: "APPROVED" as const,
  isBlocked: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginAt: null,
} satisfies Parameters<typeof db.importStaffAccounts>[0][number];

const caller = (token?: string) => appRouter.createCaller({
  req: { headers: token ? { "x-abu-staff-session": token } : {} },
  res: {},
} as TrpcContext);

async function staffToken(email: string) {
  return new SignJWT({ email, purpose: "staff-sync" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(new TextEncoder().encode(process.env.JWT_SECRET || "abu-raghwa-staff-sync-session"));
}

describe("صلاحيات العروض المنشورة", () => {
  beforeEach(() => {
    vi.spyOn(db, "getStaffAccounts").mockResolvedValue([manager]);
    vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue(null);
  });

  afterEach(() => vi.restoreAllMocks());

  it("يرفض الكتابة والحذف والقائمة الإدارية دون جلسة موظف", async () => {
    await expect(caller().offers.save({ id: "offer-a", offerData: "{}" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller().offers.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller().offers.delete({ id: "offer-a" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يمنع البائع من تغيير قائمة العروض", async () => {
    const seller = { ...manager, email: "offers-seller@example.com", role: "seller" as const };
    vi.spyOn(db, "getStaffAccounts").mockResolvedValue([seller]);
    const token = await staffToken(seller.email);
    await expect(caller(token).offers.delete({ id: "offer-a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يتيح الإدارة للمدير ويزيل حقول التكلفة من نقطة العرض العامة", async () => {
    const token = await staffToken(manager.email);
    const saveOffer = vi.spyOn(db, "saveSharedOffer").mockResolvedValue(undefined);
    const listOffers = vi.spyOn(db, "listSharedOffers").mockResolvedValue([{ id: "offer-a", title: "عرض عام" }]);
    const removeOffer = vi.spyOn(db, "deleteSharedOffer").mockResolvedValue(undefined);
    vi.spyOn(db, "getSharedOffer").mockResolvedValue({
      id: "offer-a",
      offerData: JSON.stringify({ id: "offer-a", title: "عرض عام", offerPrice: 90, totalCostPrice: 70, items: [{ name: "منتج", costPrice: 60, retailPrice: 100, offerPrice: 90 }] }),
      updatedAt: new Date(),
    });

    await expect(caller(token).offers.save({ id: "offer-a", offerData: "{}" })).resolves.toEqual({ success: true });
    await expect(caller(token).offers.list()).resolves.toEqual([{ id: "offer-a", title: "عرض عام" }]);
    await expect(caller(token).offers.delete({ id: "offer-a" })).resolves.toEqual({ success: true });
    expect(saveOffer).toHaveBeenCalledWith("offer-a", "{}");
    expect(listOffers).toHaveBeenCalledOnce();
    expect(removeOffer).toHaveBeenCalledWith("offer-a");

    const publicData = await caller().offers.get({ id: "offer-a" });
    expect(publicData).not.toMatch(/cost|profit/i);
    expect(JSON.parse(publicData || "{}")).toMatchObject({ title: "عرض عام", offerPrice: 90, items: [{ name: "منتج", retailPrice: 100, offerPrice: 90 }] });
  });
});
