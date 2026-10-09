import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("قائمة إدارة العروض الذكية", () => {
  it("تفصل العروض المتاحة والمنتهية وتتيح تفاصيل وحذف كل عرض", () => {
    const listPage = readFileSync(resolve(projectRoot, "client/src/pages/SmartOffersList.tsx"), "utf8");
    const smartOffers = readFileSync(resolve(projectRoot, "client/src/pages/SmartOffers.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    const database = readFileSync(resolve(projectRoot, "server/db.ts"), "utf8");

    expect(listPage).toContain('type OffersTab = "active" | "expired"');
    expect(listPage).toContain('getOfferExpiryInfo(offer, now).status === "active"');
    expect(listPage).toContain("العروض المتاحة");
    expect(listPage).toContain("العروض المنتهية");
    expect(listPage).toContain("عرض التفاصيل");
    expect(listPage).toContain("حذف العرض");
    expect(listPage).toContain("deleteOfferMutation.mutateAsync");
    expect(listPage).toContain("trpc.offers.list.useQuery");
    expect(listPage).toContain("setLegacySavedOffers(previous => previous.filter");
    expect(smartOffers).toContain("createOfferId(\"offer\")");
    expect(smartOffers).toContain("previous => [finalOffer, ...previous.filter");
    expect(database).toContain("mergeSharedOfferRecords");
    expect(database).toContain("delete(sharedOffers).where(eq(sharedOffers.id, id))");
    expect(smartOffers).toContain('navigate("/smart-offers-list")');
    expect(app).toContain('path={"/smart-offers-list"}');
  });
});
