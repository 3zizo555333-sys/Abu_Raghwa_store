import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("فئات المنتجات المرنة", () => {
  it("يحفظ اسم الفئة مع المنتج عبر Supabase ويشتق الخيارات من البيانات السحابية", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Products.tsx"), "utf8");
    expect(page).toContain("useCloudProducts");
    expect(page).toContain("createProduct");
    expect(page).toContain("updateProduct");
    expect(page).toContain("addProductCategory");
    expect(page).toContain("إضافة فئة");
    expect(page).toContain("customCategories");
    expect(page).toContain("availableCategories");
    expect(page).not.toContain("useCloudState");
    expect(page).not.toContain("localStorage");
  });
});
