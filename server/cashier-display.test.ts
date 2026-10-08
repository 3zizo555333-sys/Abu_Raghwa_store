import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PLU والكاشير وشاشة العملاء", () => {
  const root = resolve(import.meta.dirname, "..");
  it("يحتفظ بكود PLU وطريقة البيع بالوزن في نموذج المنتجات", () => {
    const products = readFileSync(resolve(root, "client/src/pages/Products.tsx"), "utf8");
    expect(products).toContain("plu?: string");
    expect(products).toContain('saleMode?: "unit" | "weight"');
    expect(products).toContain("كود PLU داخلي / كود الرف");
    expect(products).toContain("بالوزن — يسمح بربع ونصف كيلو");
  });

  it("يسمح للكاشير بالكميات العشرية ويبحث بكود PLU", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    expect(cashier).toContain("product.plu");
    expect(cashier).toContain("quantityStep");
    expect(cashier).toContain('type="number" min="0"');
    expect(cashier).toContain("Math.round(cart.reduce");
  });

  it("يسجل شاشة عرض عامة متصلة ببيانات المنتجات والعروض", () => {
    const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
    const display = readFileSync(resolve(root, "client/src/pages/CustomerDisplay.tsx"), "utf8");
    expect(app).toContain("/customer-display");
    expect(display).toContain('"abu_raghwa_products"');
    expect(display).toContain('"abu_raghwa_global_offers"');
    expect(display).toContain("requestFullscreen");
  });
});
