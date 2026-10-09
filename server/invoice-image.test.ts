import { describe, expect, it } from "vitest";
import { buildInvoiceImageFilename } from "../client/src/lib/invoiceImage";

describe("اسم ملف صورة الفاتورة", () => {
  it("ينشئ ملف PNG صالحاً من رقم الفاتورة", () => {
    expect(buildInvoiceImageFilename("INV-12345")).toBe("Invoice-INV-12345.png");
  });

  it("يتعامل مع رقم فاتورة فارغ باسم افتراضي صالح", () => {
    expect(buildInvoiceImageFilename()).toBe("Invoice-abu-raghwa.png");
  });
});
