import { describe, expect, it } from "vitest";
import { FEATURE_LOCKS, isFeatureLockKey, isValidFeaturePin } from "./featureLocks";

describe("feature PIN locks", () => {
  it("accepts only exactly four or six ASCII digits", () => {
    expect(isValidFeaturePin("1234")).toBe(true);
    expect(isValidFeaturePin("001234")).toBe(true);
    expect(isValidFeaturePin("123")).toBe(false);
    expect(isValidFeaturePin("12345")).toBe(false);
    expect(isValidFeaturePin("1234567")).toBe(false);
    expect(isValidFeaturePin("12a4")).toBe(false);
    expect(isValidFeaturePin("١٢٣٤")).toBe(false);
    expect(isValidFeaturePin(" 1234")).toBe(false);
  });

  it("exposes exactly the seven requested feature groups", () => {
    expect(FEATURE_LOCKS.map(feature => feature.key)).toEqual([
      "expenses",
      "settings",
      "employees",
      "materials",
      "suppliers",
      "backup",
      "financial_reports",
    ]);
    expect(isFeatureLockKey("expenses")).toBe(true);
    expect(isFeatureLockKey("unknown-section")).toBe(false);
  });
});
