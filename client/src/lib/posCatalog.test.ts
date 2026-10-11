import { describe, expect, it } from "vitest";
import { derivePosCatalog, filterPosProductsByCategory, type PosCatalogProduct, type PosCategory } from "./posCatalog";

type TestProduct = PosCatalogProduct & { name: string };
const categories: PosCategory[] = [
  { id: "powders", name: "مساحيق" },
  { id: "cleaning", name: "منظفات" },
  { id: "unused", name: "فئة فارغة" },
];
const products: TestProduct[] = [
  { id: "pour-1", name: "مسحوق صب", barcode: null, barcodes: [], categoryId: "powders", category: "مساحيق" },
  { id: "pour-2", name: "سائل صب", barcode: "  ", barcodes: [], categoryId: "cleaning", category: "منظفات" },
  { id: "barcoded-primary", name: "منظف بباركود", barcode: "12345", barcodes: ["12345"], categoryId: "cleaning", category: "منظفات" },
  { id: "barcoded-alias", name: "منظف بباركود بديل", barcode: null, barcodes: ["67890"], categoryId: "cleaning", category: "منظفات" },
  { id: "legacy-pour", name: "صنف قديم", barcode: null, barcodes: [], category: "أصناف قديمة" },
  { id: "empty-category", name: "منتج بلا فئة", barcode: null, barcodes: [], category: "" },
];

describe("POS catalog mode switching", () => {
  it("shows only products with no primary or alternate barcode in unbarcoded mode", () => {
    const unbarcoded = derivePosCatalog(products, categories, "unbarcoded");
    expect(unbarcoded.products.map(product => product.id)).toEqual(["pour-1", "pour-2", "legacy-pour", "empty-category"]);
    expect(unbarcoded.categories).toEqual(["__all__", "أصناف قديمة", "بدون فئة", "مساحيق", "منظفات"]);
  });

  it("switches to the full catalog and back without leaking category scope", () => {
    const unbarcoded = derivePosCatalog(products, categories, "unbarcoded");
    const all = derivePosCatalog(products, categories, "all");
    const backToUnbarcoded = derivePosCatalog(all.products, categories, "unbarcoded");

    expect(all.products).toHaveLength(products.length);
    expect(all.categories).toContain("فئة فارغة");
    expect(all.categories).toContain("منظفات");
    expect(backToUnbarcoded.products.map(product => product.id)).toEqual(unbarcoded.products.map(product => product.id));
    expect(backToUnbarcoded.categories).toEqual(unbarcoded.categories);
  });

  it("keeps a category created from the unbarcoded POS visible immediately even before it has a product", () => {
    const withNewCategory = derivePosCatalog(products, categories, "unbarcoded", ["unused"]);
    expect(withNewCategory.categories).toContain("فئة فارغة");
  });

  it("filters each active category without mutating the mode's product list", () => {
    const unbarcoded = derivePosCatalog(products, categories, "unbarcoded");
    const before = unbarcoded.products.map(product => product.id);
    const powders = filterPosProductsByCategory(unbarcoded.products, categories, "مساحيق");

    expect(powders.map(product => product.id)).toEqual(["pour-1"]);
    expect(unbarcoded.products.map(product => product.id)).toEqual(before);
  });
});
