import { describe, expect, it } from "vitest";
import { shouldDisableOfferPurchaseButton } from "./offerPurchaseUi";
import { createOfferId } from "./offerIds";

describe("public offer purchase button state", () => {
  const defaults = { isExpired: false, isSubmitting: false, requestId: "", isStatusFetching: false, status: undefined as const };

  it("stays enabled when no saved request exists, even if a disabled query reports loading", () => {
    expect(shouldDisableOfferPurchaseButton({ ...defaults, isStatusFetching: true })).toBe(false);
  });
  it("waits for an existing saved request status while it is being fetched", () => {
    expect(shouldDisableOfferPurchaseButton({ ...defaults, requestId: "request-1", isStatusFetching: true })).toBe(true);
  });
  it("blocks duplicate submissions while a request is pending", () => {
    expect(shouldDisableOfferPurchaseButton({ ...defaults, requestId: "request-1", status: "pending" })).toBe(true);
  });
  it("allows another purchase after the previous request was approved", () => {
    expect(shouldDisableOfferPurchaseButton({ ...defaults, requestId: "request-1", status: "approved" })).toBe(false);
  });
  it("blocks expired coupons and requests currently being sent", () => {
    expect(shouldDisableOfferPurchaseButton({ ...defaults, isExpired: true })).toBe(true);
    expect(shouldDisableOfferPurchaseButton({ ...defaults, isSubmitting: true })).toBe(true);
  });
  it("creates distinct IDs for offers generated one after another", () => {
    expect(createOfferId("offer")).not.toBe(createOfferId("offer"));
  });
});
