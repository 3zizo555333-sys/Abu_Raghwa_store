import { describe, expect, it } from "vitest";
import type { CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { isOfferInSchedule } from "./PromoCarousel";

const makeOffer = (patch: Partial<CloudStoreOffer> = {}) => ({
  id: "offer-1",
  title: "عرض منظفات",
  status: "active",
  deleted_at: null,
  offer_price: 100,
  starts_at: null,
  ends_at: null,
  offer_data: { description: "خصم خاص" },
  ...patch,
} as unknown as CloudStoreOffer);

describe("PromoCarousel offer schedule", () => {
  it("keeps active offers even when optional display fields or price are missing", () => {
    expect(isOfferInSchedule(makeOffer({ title: "", offer_price: 0, offer_data: {} }))).toBe(true);
  });

  it("rejects records without an id and offers outside their active time window", () => {
    expect(isOfferInSchedule(makeOffer({ id: "" }))).toBe(false);
    expect(isOfferInSchedule(makeOffer({ ends_at: "2020-01-01T00:00:00.000Z" }))).toBe(false);
    expect(isOfferInSchedule(makeOffer({ starts_at: "2099-01-01T00:00:00.000Z" }))).toBe(false);
  });
});
