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

  it("يجعل أصناف الصب بلا باركود الوضع الافتراضي ويعزل فئاتها عن وضع الدليل الكامل", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const catalog = readFileSync(resolve(root, "client/src/lib/posCatalog.ts"), "utf8");
    expect(cashier).toContain('useState<PosMode>("unbarcoded")');
    expect(cashier).toContain('derivePosCatalog(products, productCategories, posMode');
    expect(cashier).toContain('derivePosCatalog(products, productCategories, "unbarcoded"');
    expect(catalog).toContain('products.filter(isUnbarcodedProduct)');
    expect(cashier).toContain('aria-label="نمط البيع السريع"');
    expect(cashier).toContain("أصناف الصب");
    expect(cashier).toContain("جميع المنتجات");
    expect(cashier).toContain('onClick={() => { setPosMode("unbarcoded"); setActivePosCategory("__all__"); }}');
    expect(cashier).toContain('onClick={() => { setPosMode("all"); setActivePosCategory("__all__"); }}');
    expect(cashier).toContain('if (!posCategories.includes(activePosCategory)) setActivePosCategory("__all__")');
    const modeTabs = cashier.slice(cashier.indexOf('aria-label="نمط البيع السريع"'), cashier.indexOf('aria-label="فئات البيع السريع"'));
    expect(modeTabs).not.toContain("setCart(");
  });

  it("يدير فئات أصناف الصب بوضوح ويقيد الحذف بدور المدير/المسؤول", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const manager = readFileSync(resolve(root, "client/src/components/UnbarcodedCategoryManager.tsx"), "utf8");
    const permissions = readFileSync(resolve(root, "client/src/lib/productCategoryPermissions.ts"), "utf8");
    expect(cashier).toContain("<UnbarcodedCategoryManager");
    expect(manager).toContain("إضافة فئة");
    expect(manager).toContain("createProductCategory");
    expect(manager).toContain("updateProductCategory");
    expect(manager).toContain("deleteProductCategory");
    expect(manager).toContain('role="alertdialog"');
    expect(manager).toContain("getActiveShopContext");
    expect(permissions).toContain('role === "supervisor"');
    expect(permissions).toContain('role === "admin"');
    expect(permissions).toContain('role === "manager"');
  });

  it("يوفر نقاطاً افتراضية للصنف بلا باركود ويظل الخادم مسؤولاً عن النقاط المكتسبة", () => {
    const products = readFileSync(resolve(root, "client/src/pages/Products.tsx"), "utf8");
    const loyalty = readFileSync(resolve(root, "supabase/migrations/20261011135000_restore_tiered_bulk_unit_invoice_loyalty.sql"), "utf8");
    const invoice = readFileSync(resolve(root, "supabase/migrations/20261011101500_loyalty_returns.sql"), "utf8");
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const completeSale = cashier.slice(cashier.indexOf("const completeSale"), cashier.indexOf("const handlePosCategoryChange"));
    expect(products).toContain("نقاط الولاء لصنف الصب لكل");
    expect(products).toContain('value={formData.loyaltyPoints || "30"}');
    expect(products).toContain("resolveProductLoyaltyPoints");
    expect(cashier).toContain("getCartLoyaltyPointsTotal(cart)");
    expect(completeSale).toContain("saleType,");
    expect(completeSale).toContain("quantity: item.quantity");
    expect(completeSale).not.toContain("loyaltyPoints:");
    expect(loyalty).toContain("when 'wholesale' then coalesce");
    expect(loyalty).toContain("case v_invoice.sale_type");
    expect(loyalty).toContain("coalesce(v_item.product_points, 0)");
    expect(loyalty).toContain("v_item.quantity");
    expect(loyalty).toContain("v_item.units_per_bulk");
    expect(loyalty).toContain("v_item.selected_unit_snapshot = v_item.bulk_unit_name");
    expect(loyalty).toContain("revoke all on function public.apply_invoice_loyalty");
    expect(loyalty).not.toContain("grant execute on function public.apply_invoice_loyalty");
    expect(invoice).toContain("v_loyalty := public.apply_invoice_loyalty");
    expect(invoice).toContain("public.loyalty_point_ledger");
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
