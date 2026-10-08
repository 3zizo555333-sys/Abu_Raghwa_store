import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("حذف المبيعات من السجل", () => {
  it("يحتوي سجل المبيعات على تأكيد حذف وتحديث التخزين السحابي القديم", () => {
    const source = readFileSync(resolve(projectRoot, "client/src/pages/Sales.tsx"), "utf8");

    expect(source).toContain("handleDeleteSale");
    expect(source).toContain("هل تريد المتابعة؟");
    expect(source).toContain('localStorage.setItem("abu_raghwa_sales", JSON.stringify(updatedSales))');
    expect(source).toContain("حذف المبيعة");
  });
});
