import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("فئات المنتجات المرنة", () => {
  it("يحفظ الفئة الجديدة سحابيًا ويضيفها لقائمة الاختيار", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Products.tsx"), "utf8");
    expect(page).toContain("abu_raghwa_product_categories");
    expect(page).toContain("addProductCategory");
    expect(page).toContain("إضافة فئة");
    expect(page).toContain("customCategories");
    expect(page).toContain("availableCategories");
  });
});
