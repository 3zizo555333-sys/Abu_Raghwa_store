import { describe, expect, it } from "vitest";
import { parseInvoiceDataUrl, safeInvoiceFilename } from "./invoiceUpload";

describe("رفع صور الفواتير", () => {
  it("يحلل صورة base64 صالحة ويحافظ على نوعها", () => {
    const parsed = parseInvoiceDataUrl("data:image/png;base64,aGVsbG8=");
    expect(parsed.mimeType).toBe("image/png");
    expect(parsed.bytes.toString()).toBe("hello");
  });

  it("يرفض البيانات غير الصورية ويجهز اسم ملف آمن", () => {
    expect(() => parseInvoiceDataUrl("data:text/plain;base64,aGVsbG8=")).toThrow();
    expect(safeInvoiceFilename("فاتورة اليوم!.jpg", "image/jpeg")).toMatch(/\.jpeg$/);
  });
});
