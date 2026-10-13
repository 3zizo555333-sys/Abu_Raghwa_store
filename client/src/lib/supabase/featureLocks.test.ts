import { describe, expect, it } from "vitest";
import { isFeatureLockKey, isValidFeaturePin } from "./featureLocks";
import { SCREEN_PIN_LOCKS, screenPinKeyForPath } from "./screenPinRegistry";

describe("independent screen PIN locks", () => {
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

  it("assigns a unique dynamic key to every internal staff route", () => {
    const keys = SCREEN_PIN_LOCKS.map(feature => feature.key);
    expect(SCREEN_PIN_LOCKS.length).toBeGreaterThan(40);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(screenPinKeyForPath("/cashier"));
    expect(keys).toContain(screenPinKeyForPath("/sales"));
    expect(keys).toContain(screenPinKeyForPath("/material-details/:id"));
    expect(screenPinKeyForPath("/cashier")).not.toBe(screenPinKeyForPath("/sales"));
    expect(isFeatureLockKey(screenPinKeyForPath("/cashier"))).toBe(true);
    expect(isFeatureLockKey("expenses")).toBe(false);
    expect(isFeatureLockKey("screen__invalid/key")).toBe(false);
  });

  it("does not register authentication, public customer screens, or security recovery", () => {
    const paths = SCREEN_PIN_LOCKS.map(feature => feature.path);
    expect(paths).not.toContain("/auth");
    expect(paths).not.toContain("/catalog");
    expect(paths).not.toContain("/loyalty");
    expect(paths).not.toContain("/security-settings");
  });
});
