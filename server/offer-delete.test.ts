import { describe, expect, it, vi } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCaller() {
  return appRouter.createCaller({
    user: {
      id: 1,
      openId: "manager",
      name: "مدير",
      email: "manager@example.com",
      loginMethod: "manus",
      role: "admin",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext);
}

describe("حذف العرض", () => {
  it("يحذف العرض المطلوب من سجل العروض السحابي", async () => {
    const removeOffer = vi.spyOn(db, "deleteSharedOffer").mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: {
        id: 1,
        openId: "manager",
        name: "مدير",
        email: "manager@example.com",
        loginMethod: "manus",
        role: "admin",
        createdAt: new Date(),
        updatedAt: new Date(),
        lastSignedIn: new Date(),
      },
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext);

    await expect(caller.offers.delete({ id: "offer-to-remove" })).resolves.toEqual({ success: true });
    expect(removeOffer).toHaveBeenCalledWith("offer-to-remove");
  });

  it("يسمح للحساب الذي دخل للتطبيق محليًا بحذف العرض دون جلسة OAuth منفصلة", async () => {
    const removeOffer = vi.spyOn(db, "deleteSharedOffer").mockResolvedValue(undefined);
    const caller = appRouter.createCaller({
      user: null,
      req: {} as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    } as TrpcContext);

    await expect(caller.offers.delete({ id: "offer-local-session" })).resolves.toEqual({ success: true });
    expect(removeOffer).toHaveBeenCalledWith("offer-local-session");
  });

  it("يعرض كل العروض المنشورة المخزنة كسجلات مستقلة", async () => {
    const offers = [{ id: "offer-a", title: "الأول" }, { id: "offer-b", title: "الثاني" }, { id: "offer-c", title: "الثالث" }];
    const listOffers = vi.spyOn(db, "listSharedOffers").mockResolvedValue(offers);
    await expect(makeCaller().offers.list()).resolves.toEqual(offers);
    expect(listOffers).toHaveBeenCalledOnce();
  });
});
