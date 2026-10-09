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

  it("يسمح بالكميات العشرية ويبحث بالباركود عبر نتائج Supabase", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const quantities = readFileSync(resolve(root, "client/src/lib/cashierQuantity.ts"), "utf8");
    const products = readFileSync(resolve(root, "client/src/lib/supabase/products.ts"), "utf8");
    expect(cashier).toContain('step={item.unit === "كيلو" || item.unit === "جرام" || item.unit === "لتر" ? "any" : 1}');
    expect(cashier).toContain("normalizeCashierQuantity(rawQuantity)");
    expect(quantities).toContain('unit === "كيلو" || unit === "جرام" || unit === "لتر" ? 0.001 : 1');
    expect(quantities).toContain("Math.round(value * 1_000_000) / 1_000_000");
    expect(cashier).toContain("findProductsByBarcode(barcodeProducts, code)");
    expect(cashier).toContain("setBarcodeChoices(matches)");
    expect(products).toContain('supabase.rpc("search_products_by_barcode"');
  });

  it("لا يعلن نجاح البيع ولا يفرغ السلة قبل تأكيد إنشاء الفاتورة", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const completeSale = cashier.slice(cashier.indexOf("const completeSale"), cashier.indexOf("const filteredProducts"));
    const rpcCall = completeSale.indexOf("await createCloudInvoice(");
    expect(rpcCall).toBeGreaterThanOrEqual(0);
    expect(completeSale.indexOf("toast.success(")).toBeGreaterThan(rpcCall);
    expect(completeSale.indexOf("setCart([])")).toBeGreaterThan(rpcCall);
    expect(completeSale).toContain("catch (error)");
    expect(completeSale).toContain("لم تُفرّغ السلة");
    expect(cashier).not.toContain("localStorage");
    expect(cashier).not.toContain("sessionStorage");
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
