import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("عارض صور الفواتير", () => {
  it("يوفر فتحًا صريحًا وتحميلًا مسبقًا وتنقلًا وتكبيرًا وتصغيرًا", () => {
    const page = readFileSync(resolve(projectRoot, "client/src/pages/InvoiceCameraPage.tsx"), "utf8");

    expect(page).toContain("فتح الفاتورة");
    expect(page).toContain("openInvoiceViewer");
    expect(page).toContain("moveInvoiceViewer");
    expect(page).toContain("يتم فتح الفاتورة الآن...");
    expect(page).toContain("فتح الصورة في نافذة مستقلة");
    expect(page).toContain("تكبير");
    expect(page).toContain("تصغير");
    expect(page).toContain('image.src = invoice.url');
  });
});
