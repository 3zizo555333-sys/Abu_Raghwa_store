import { describe, expect, it } from "vitest";
import type { CloudStoreOffer } from "@/lib/supabase/storeOffers";
import { isRenderableOffer } from "./PromoCarousel";

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

describe("PromoCarousel offer filtering", () => {
  it("accepts a complete active offer without an image", () => {
    expect(isRenderableOffer(makeOffer())).toBe(true);
  });

  it("rejects empty, expired, future, and zero-price offers", () => {
    expect(isRenderableOffer(makeOffer({ title: "", offer_data: {} }))).toBe(false);
    expect(isRenderableOffer(makeOffer({ ends_at: "2020-01-01T00:00:00.000Z" }))).toBe(false);
    expect(isRenderableOffer(makeOffer({ starts_at: "2099-01-01T00:00:00.000Z" }))).toBe(false);
    expect(isRenderableOffer(makeOffer({ offer_price: 0 }))).toBe(false);
  });
});
