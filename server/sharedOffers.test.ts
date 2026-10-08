import { describe, expect, it } from "vitest";
import { mergeSharedOfferRecords, publicOfferJson, removeOfferFromLegacyData } from "./sharedOffers";

const json = (id: string, title: string) => JSON.stringify({ id, title });

describe("published offers list retention", () => {
  it("retains every individual offer and any legacy offer not already represented", () => {
    const offers = mergeSharedOfferRecords(
      JSON.stringify([{ id: "legacy-only", title: "قديم" }, { id: "offer-a", title: "نسخة قديمة" }]),
      [json("offer-a", "العرض الأول"), json("offer-b", "العرض الثاني")],
    );
    expect(offers.map(offer => offer.id)).toEqual(["offer-a", "offer-b", "legacy-only"]);
    expect(offers.find(offer => offer.id === "offer-a")?.title).toBe("العرض الأول");
  });

  it("skips malformed data without losing otherwise valid offers", () => {
    const offers = mergeSharedOfferRecords("not-json", ["broken", json("good", "عرض صالح")]);
    expect(offers.map(offer => offer.id)).toEqual(["good"]);
  });

  it("manual deletion removes only the chosen offer from the legacy list", () => {
    const original = JSON.stringify([{ id: "keep-a" }, { id: "delete-me" }, { id: "keep-b" }]);
    const result = removeOfferFromLegacyData(original, "delete-me");
    expect(result.changed).toBe(true);
    expect(JSON.parse(result.dataJson).map((offer: { id: string }) => offer.id)).toEqual(["keep-a", "keep-b"]);
  });

  it("removes nested cost and profit fields from public offer JSON", () => {
    const result = publicOfferJson(JSON.stringify({
      id: "public-offer",
      offerPrice: 90,
      totalCostPrice: 70,
      items: [{ name: "منتج", retailPrice: 100, costPrice: 60, offerPrice: 90, supplierName: "مورد" }],
    }));
    expect(result).not.toBeNull();
    expect(result).not.toMatch(/cost|profit|supplier/i);
    expect(JSON.parse(result!)).toMatchObject({ id: "public-offer", offerPrice: 90, items: [{ name: "منتج", retailPrice: 100, offerPrice: 90 }] });
    expect(publicOfferJson("not-json")).toBeNull();
  });
});
