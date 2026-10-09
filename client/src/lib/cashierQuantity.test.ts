import { describe, expect, it } from "vitest";
import { getCashierQuantityStep, normalizeCashierQuantity } from "./cashierQuantity";

describe("cashier free decimal quantities", () => {
  it("keeps fine decimal weights such as 100g and 50g", () => {
    expect(normalizeCashierQuantity(0.1)).toBe(0.1);
    expect(normalizeCashierQuantity(0.05)).toBe(0.05);
    expect(normalizeCashierQuantity(0.001)).toBe(0.001);
  });

  it("uses a fine button step for weighted units and whole units otherwise", () => {
    expect(getCashierQuantityStep("كيلو")).toBe(0.001);
    expect(getCashierQuantityStep("جرام")).toBe(0.001);
    expect(getCashierQuantityStep("وحدة")).toBe(1);
  });

  it("rejects invalid numbers without creating a broken cart quantity", () => {
    expect(normalizeCashierQuantity(Number.NaN)).toBe(0);
    expect(normalizeCashierQuantity(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
