import { describe, expect, it } from "vitest";
import {
  collectProductBarcodes,
  containsMultipleBarcodeValues,
  createEmptyAdditionalBarcodeSlots,
  getAdditionalBarcodeSlots,
  getBarcodeFieldError,
  INITIAL_ADDITIONAL_BARCODE_SLOTS,
  INITIAL_TOTAL_PRODUCT_BARCODE_SLOTS,
} from "./productBarcodeSlots";

describe("product barcode slots", () => {
  it("starts with five total slots: one primary and four additional", () => {
    expect(INITIAL_TOTAL_PRODUCT_BARCODE_SLOTS).toBe(5);
    expect(createEmptyAdditionalBarcodeSlots()).toHaveLength(INITIAL_ADDITIONAL_BARCODE_SLOTS);
    expect(INITIAL_ADDITIONAL_BARCODE_SLOTS).toBe(4);
  });

  it("splits legacy comma-separated and numbered extra codes into separate inputs when editing", () => {
    expect(getAdditionalBarcodeSlots({
      id: "product-1",
      code: "8901",
      barcodes: "8901, 8902;8903",
      barcode4: "8904",
      additionalBarcodes: ["8905"],
    })).toEqual(["8902", "8903", "8904", "8905"]);
  });

  it("keeps more than five existing aliases instead of silently dropping any", () => {
    expect(getAdditionalBarcodeSlots({ id: "p", code: "main", barcodes: ["main", "a", "b", "c", "d", "e"] }))
      .toEqual(["a", "b", "c", "d", "e"]);
  });

  it("rejects multiple codes pasted into a single slot with a precise field error", () => {
    expect(containsMultipleBarcodeValues("8901,8902")).toBe(true);
    expect(containsMultipleBarcodeValues(" 8901 ")).toBe(false);
    expect(getBarcodeFieldError("8901", ["8902", "8903;8904"])).toEqual({ field: "additional", index: 1 });
    expect(getBarcodeFieldError("8901 8902", [""])).toEqual({ field: "primary" });
    expect(getBarcodeFieldError("8901", ["", "8902"])).toBeNull();
  });

  it("saves one normalized, de-duplicated value per barcode field", () => {
    expect(collectProductBarcodes(" ٨٩٠١ ", ["8902", "", "8902", "8903"]))
      .toEqual(["8901", "8902", "8903"]);
  });
});
