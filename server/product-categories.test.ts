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
    expect(page).toContain("createProductCategory");
    expect(page).toContain("updateProductCategory");
    expect(page).toContain("deleteProductCategory");
    expect(page).toContain("إدارة فئات المنتجات");
    expect(page).toContain("فئات قديمة غير محفوظة كسجلات");
    expect(page).not.toContain("customCategories");
    expect(page).toContain("availableCategories");
    expect(page).not.toContain("useCloudState");
    expect(page).not.toContain("localStorage");
  });

  it("يسهّل تمييز أصناف الصب ونقلها لفئاتها من دون فرض باركود", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Products.tsx"), "utf8");
    expect(page).toContain('useState<"all" | "unbarcoded">("all")');
    expect(page).toContain('barcodeFilter === "all" || isUnbarcodedProduct(p)');
    expect(page).toContain('aria-label="تصنيف الباركود"');
    expect(page).toContain("تحويل إلى صنف صب (مسح كل الباركودات)");
    expect(page).toContain("تظهر فئة الصب تلقائياً في الكاشير");
    expect(page).toContain('internalCode: product.code || ""');
    expect(page).toContain('code: product.barcode || ""');
    expect(page).toContain('code: productCode, barcode: formData.code.trim() || null');
  });
});
