import { describe, expect, it } from "vitest";
import { normalizeCopyCode } from "./CopyCodeButton";

describe("normalizeCopyCode", () => {
  it("removes hashes and all whitespace while preserving the remaining code", () => {
    expect(normalizeCopyCode("  # INV- 123\nABC # ")).toBe("INV-123ABC");
  });
});
