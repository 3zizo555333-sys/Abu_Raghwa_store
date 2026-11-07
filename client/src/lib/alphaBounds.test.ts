import { describe, expect, it } from "vitest";
import { findAlphaBounds } from "./alphaBounds";

function imageData(width: number, height: number, pixels: Array<[number, number, number]>) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of pixels) data[(y * width + x) * 4 + 3] = alpha;
  return data;
}

describe("transparent image alpha bounds", () => {
  it("finds the tight visible bounding rectangle while ignoring transparent pixels", () => {
    expect(findAlphaBounds(imageData(7, 6, [[2, 1, 255], [3, 2, 128], [4, 4, 255]]), 7, 6))
      .toEqual({ x: 2, y: 1, width: 3, height: 4 });
  });

  it("ignores alpha fringe at or below the threshold but preserves faint visible shadow", () => {
    expect(findAlphaBounds(imageData(5, 5, [[0, 0, 2], [1, 1, 3], [3, 3, 1]]), 5, 5, 2))
      .toEqual({ x: 1, y: 1, width: 1, height: 1 });
  });

  it("returns null for fully transparent or invalid images", () => {
    expect(findAlphaBounds(imageData(3, 2, []), 3, 2)).toBeNull();
    expect(findAlphaBounds(new Uint8ClampedArray(4), 3, 2)).toBeNull();
    expect(findAlphaBounds(new Uint8ClampedArray(), 0, 2)).toBeNull();
  });
});
