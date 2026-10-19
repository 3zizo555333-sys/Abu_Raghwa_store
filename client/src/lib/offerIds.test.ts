import { describe, expect, it } from "vitest";
import { createOfferId } from "./offerIds";

describe("unique offer IDs", () => {
  it("keeps each offer distinct even if created immediately one after another", () => {
    const first = createOfferId("manual_offer");
    const second = createOfferId("manual_offer");
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });
});
