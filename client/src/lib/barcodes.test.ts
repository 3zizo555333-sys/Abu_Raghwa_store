import { describe, expect, it } from "vitest";
import { findProductsByBarcode, getProductBarcodes, matchesProductBarcode, normalizeBarcodeToken, normalizeBarcodeValues } from "./barcodes";

describe("product barcode matching", () => {
  it("normalizes comma, space, and semicolon separated additional codes", () => {
    expect(normalizeBarcodeValues("8902, 8903; 8905 8910")).toEqual(["8902", "8903", "8905", "8910"]);
  });

  it("reads legacy JSON barcode arrays", () => {
    expect(normalizeBarcodeValues('["8902","8903"]')).toEqual(["8902", "8903"]);
  });

  it("matches an alternate barcode regardless of whether storage is an array or string", () => {
    const product = { id: "product-1", code: "8901", barcodes: "8902, 8903;8905" };
    expect(getProductBarcodes(product)).toEqual(["8901", "8902", "8903", "8905", "product-1"]);
    expect(matchesProductBarcode(product, "8903")).toBe(true);
    expect(matchesProductBarcode(product, "8909")).toBe(false);
  });

  it("reads legacy numbered and named alternate barcode fields", () => {
    const product = { id: "product-2", code: "8901", barcode2: "8902", barcode3: "8903", additionalBarcodes: ["8905"], alternateBarcodes: "8910" };
    expect(matchesProductBarcode(product, "8902")).toBe(true);
    expect(matchesProductBarcode(product, "8903")).toBe(true);
    expect(matchesProductBarcode(product, "8905")).toBe(true);
    expect(matchesProductBarcode(product, "8910")).toBe(true);
  });

  it("normalizes Arabic-Indic digits and harmless scanner separators", () => {
    expect(normalizeBarcodeToken("  ٨٩٠٢  ")).toBe("8902");
    expect(matchesProductBarcode({ id: "product-3", barcodes: ["8902"] }, "89-02")).toBe(true);
  });

  it("matches every saved additional alias even when a scanner sends an AIM prefix", () => {
    const product = { id: "soap", code: "8901", additionalBarcodes: ["8902", "8903"] };
    expect(matchesProductBarcode(product, "]C18903")).toBe(true);
    expect(matchesProductBarcode(product, "8902\r\n")).toBe(true);
  });

  it("matches UPC-A and its equivalent zero-prefixed EAN-13 form", () => {
    expect(matchesProductBarcode({ id: "drink", code: "0036000291452" }, "036000291452")).toBe(true);
    expect(matchesProductBarcode({ id: "drink", barcodes: ["036000291452"] }, "0036000291452")).toBe(true);
  });

  it("normalizes Persian numerals and returns every product sharing an alias for cashier disambiguation", () => {
    expect(normalizeBarcodeToken("۹۸۷۶")).toBe("9876");
    const products = [
      { id: "one", name: "عبوة صغيرة", additionalBarcodes: ["9876"] },
      { id: "two", name: "عبوة كبيرة", alternateBarcodes: ["9876"] },
      { id: "three", name: "صنف آخر", code: "1111" },
    ];
    expect(findProductsByBarcode(products, "9876").map(product => product.id)).toEqual(["one", "two"]);
  });
});
