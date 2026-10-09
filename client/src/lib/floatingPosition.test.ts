import { describe, expect, it } from "vitest";
import { clampFloatingPosition } from "./floatingPosition";

describe("clampFloatingPosition", () => {
  it("keeps the button inside the viewport", () => {
    expect(clampFloatingPosition({ x: -100, y: -40 }, 393, 870)).toEqual({ x: 16, y: 16 });
    expect(clampFloatingPosition({ x: 500, y: 1200 }, 393, 870)).toEqual({ x: 321, y: 798 });
  });

  it("handles invalid positions with a safe margin", () => {
    expect(clampFloatingPosition({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, 800, 600)).toEqual({ x: 16, y: 16 });
  });
});
