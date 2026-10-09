import { describe, expect, it } from "vitest";
import { DEFAULT_SCALE_SETTINGS, normalizeScaleSettings } from "./scaleSettings";

describe("scale settings", () => {
  it("keeps supported connection modes and decimal precision", () => {
    const value = normalizeScaleSettings({ enabled: true, connectionMode: "keyboard", unit: "g", decimalPlaces: 5, deviceName: "Test scale" });
    expect(value.enabled).toBe(true);
    expect(value.connectionMode).toBe("keyboard");
    expect(value.unit).toBe("g");
    expect(value.decimalPlaces).toBe(5);
    expect(value.deviceName).toBe("Test scale");
  });

  it("falls back safely for legacy or invalid values", () => {
    expect(normalizeScaleSettings({ connectionMode: "unknown", decimalPlaces: 99 })).toMatchObject({
      ...DEFAULT_SCALE_SETTINGS,
      decimalPlaces: 6,
    });
    expect(normalizeScaleSettings(null)).toEqual(DEFAULT_SCALE_SETTINGS);
  });
});
