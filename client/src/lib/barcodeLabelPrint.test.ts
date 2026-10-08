import { describe, expect, it } from "vitest";
import { createBarcodeLabelPrintHtml, createBarcodePrintLabels } from "./barcodeLabelPrint";

describe("barcode label printing", () => {
  it("creates a separate label for the primary and every additional barcode", () => {
    expect(createBarcodePrintLabels("صابون", "8901", ["8902", "", "8903"])).toEqual({
      labels: [
        { productName: "صابون", barcode: "8901" },
        { productName: "صابون", barcode: "8902" },
        { productName: "صابون", barcode: "8903" },
      ],
      error: null,
    });
  });

  it("does not create labels when a barcode field contains multiple delimited values", () => {
    const result = createBarcodePrintLabels("صابون", "8901", ["8902,8903"]);
    expect(result.labels).toEqual([]);
    expect(result.error).toEqual({ field: "additional", index: 0 });
  });

  it("builds an Arabic A4 label sheet and escapes product text", () => {
    const html = createBarcodeLabelPrintHtml(
      [{ productName: '<img src=x onerror="alert(1)">', barcode: "8901" }],
      ['<svg xmlns="http://www.w3.org/2000/svg"></svg>'],
    );
    expect(html).toContain('lang="ar" dir="rtl"');
    expect(html).toContain("@page { size: A4");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    expect(html).toContain('class="barcode-value" dir="ltr">8901</p>');
  });

  it("requires one generated barcode SVG for each label", () => {
    expect(() => createBarcodeLabelPrintHtml([{ productName: "صابون", barcode: "8901" }], []))
      .toThrow("Barcode label and SVG counts must match");
  });
});
