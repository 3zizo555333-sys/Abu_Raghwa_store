import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("PLU والكاشير وشاشة العملاء", () => {
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

  it("يعرض أزرار نوع البيع داخل السلة ويعيد تسعيرها قبل الإتمام", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const selector = readFileSync(resolve(root, "client/src/components/SaleTypeSegmentedControl.tsx"), "utf8");
    const selectorIndex = cashier.indexOf("<SaleTypeSegmentedControl");
    const cartIndex = cashier.indexOf("<aside");
    const checkoutIndex = cashier.indexOf("onClick={completeSale}");

    expect(selectorIndex).toBeGreaterThan(cartIndex);
    expect(selectorIndex).toBeLessThan(checkoutIndex);
    expect(selector).toContain('aria-label="نوع البيع"');
    expect(selector).toContain("aria-pressed={selected}");
    expect(selector).toContain("onClick={() => onChange(type.value)}");
    expect(selector).toContain('label: "قطاعي"');
    expect(selector).toContain('label: "تجزئة"');
    expect(selector).toContain('label: "جملة"');
    expect(cashier).toContain("total: item.quantity * unitPrice");
    expect(cashier).toContain("getSaleUnitOptions(item,");
    expect(cashier).toContain("changeCartUnit(item.id");
  });

  it("يعرض تبويبات فئات أفقية وبطاقات لمس تضيف المنتج فورًا", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const products = readFileSync(resolve(root, "client/src/lib/supabase/products.ts"), "utf8");
    expect(cashier).toContain('aria-label="فئات البيع السريع"');
    expect(cashier).toContain("overflow-x-auto");
    expect(cashier).toContain("activePosCategory");
    expect(cashier).toContain('onClick={() => addProduct(product)}');
    expect(cashier).toContain("min-h-28");
    expect(products).toContain('supabase.rpc("update_product"');
    expect(products).toContain("createProductCategory");
    expect(products).toContain("updateProductCategory");
    expect(products).toContain("deleteProductCategory");
    expect(products).not.toMatch(/from\("products"\)\.(?:insert|update|upsert|delete)/);
  });

  it("يسمح بكتابة الكمية مباشرة مع أزرار زيادة ونقصان كبيرة للمس", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    expect(cashier).toContain("quantityDrafts[item.id] ?? item.quantity");
    expect(cashier).toContain("changeQuantityDraft(item.id, event.target.value)");
    expect(cashier).toContain("commitQuantityDraft(item.id)");
    expect(cashier).toContain("تقليل كمية ${item.name}");
    expect(cashier).toContain("زيادة كمية ${item.name}");
    expect(cashier).toContain("h-12 w-12");
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
