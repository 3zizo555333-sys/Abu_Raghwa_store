import { describe, expect, it } from "vitest";
import { createOfferId } from "./offerIds";

describe("unique offer IDs", () => {
  it("keeps each offer distinct even if created immediately one after another", () => {
    const first = createOfferId("manual_offer");
    const second = createOfferId("manual_offer");
    expect(first).toMatch(/^manual_offer_\d+_/);
    expect(second).toMatch(/^manual_offer_\d+_/);
    expect(second).not.toBe(first);
  });
});
