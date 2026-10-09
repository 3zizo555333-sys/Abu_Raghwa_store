import { describe, expect, it } from "vitest";
import { normalizeLoyaltyPoints } from "./loyaltyPoints";

describe("normalizeLoyaltyPoints", () => {
  it("keeps optional loyalty points disabled when the field is empty or invalid", () => {
    expect(normalizeLoyaltyPoints("")).toBe(0);
    expect(normalizeLoyaltyPoints(undefined)).toBe(0);
    expect(normalizeLoyaltyPoints(-5)).toBe(0);
    expect(normalizeLoyaltyPoints("not-a-number")).toBe(0);
  });

  it("stores positive loyalty points as whole points", () => {
    expect(normalizeLoyaltyPoints("10")).toBe(10);
    expect(normalizeLoyaltyPoints(10.9)).toBe(10);
  });
});
