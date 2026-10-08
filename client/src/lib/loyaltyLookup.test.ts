import { describe, expect, it } from "vitest";
import { buildLoyaltyPageHref, shouldLookupLoyaltyProfile } from "./loyaltyLookup";

describe("customer loyalty profile lookup", () => {
  it("allows the generated four-character loyalty code without a phone number", () => {
    expect(shouldLookupLoyaltyProfile("", "5555")).toBe(true);
    expect(buildLoyaltyPageHref("5555")).toBe("/loyalty?code=5555");
  });

  it("keeps the phone optional while allowing a valid phone-only lookup", () => {
    expect(shouldLookupLoyaltyProfile("01069035599", "")).toBe(true);
    expect(shouldLookupLoyaltyProfile("", "")).toBe(false);
  });

  it("does not treat a partial code as valid, but includes a provided phone", () => {
    expect(shouldLookupLoyaltyProfile("", "555")).toBe(false);
    expect(buildLoyaltyPageHref("555", "01069035599")).toBe("/loyalty?phone=01069035599");
  });

  it("preserves the code typed on the offer page in the customer tracking link", () => {
    expect(buildLoyaltyPageHref("5555", "")).toBe("/loyalty?code=5555");
    expect(buildLoyaltyPageHref("ab12", "01069035599")).toBe("/loyalty?code=ab12&phone=01069035599");
  });
});
