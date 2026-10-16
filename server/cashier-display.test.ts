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
    expect(cashier).toContain('step="any"');
    expect(cashier).toContain("normalizeCashierQuantity(rawQuantity)");
    expect(quantities).toContain("return 1;");
    expect(quantities).toContain("getCashierWeightPresets");
    expect(cashier).toContain("isCashierWeightUnit(item.unit)");
    expect(quantities).toContain("+¼ كجم");
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
    expect(cashier).toContain("flex-wrap gap-2 pb-2");
    expect(cashier).not.toContain("overflow-x-auto");
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
    const parked = readFileSync(resolve(root, "client/src/lib/cashierParkedInvoices.ts"), "utf8");
    const completeSale = cashier.slice(cashier.indexOf("const completeSale"), cashier.indexOf("const handlePosCategoryChange"));
    expect(products).toContain("نقاط الولاء لصنف الصب لكل");
    expect(products).toContain('value={formData.loyaltyPoints || "30"}');
    expect(products).toContain("resolveProductLoyaltyPoints");
    expect(cashier).toContain("getCartLoyaltyPointsTotal(cart)");
    expect(completeSale).toContain("saleType,");
    expect(parked).toContain("quantity: item.quantity");
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

  it("يمنع التركيز التلقائي على الهاتف ويثبت viewport وحقول الإدخال دون تمرير أفقي", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "client/src/index.css"), "utf8");
    const html = readFileSync(resolve(root, "client/index.html"), "utf8");
    expect(cashier).toContain('matchMedia("(pointer: coarse)")');
    expect(cashier).toContain("cashier-mobile min-h-dvh w-full max-w-full overflow-x-hidden");
    expect(styles).toContain("overflow-x: hidden");
    expect(styles).toContain("font-size: 16px !important");
    expect(styles).toContain("#root {");
    expect(html).toContain("maximum-scale=1");
    expect(html).toContain("viewport-fit=cover");
  });

  it("يعرض معاينة الفاتورة بعرض الشاشة ويمنع قص الجدول أفقياً مع إبقاء مقاس الطباعة", () => {
    const invoice = readFileSync(resolve(root, "client/src/pages/Invoice.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "client/src/index.css"), "utf8");
    expect(invoice).toContain("invoice-mobile min-h-dvh w-full max-w-full overflow-x-hidden");
    expect(invoice).toContain("max-w-3xl");
    expect(invoice).toContain("table-fixed");
    expect(invoice).toContain('width: "100%"');
    expect(styles).toContain(".thermal-receipt {");
    expect(styles).toContain("width: var(--receipt-width, 80mm) !important");
  });

  it("يفرغ نموذج العميل فوراً ويحفظ الفشل في قائمة المعلقات دون إيقاف الكاشير", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const parked = readFileSync(resolve(root, "client/src/lib/cashierParkedInvoices.ts"), "utf8");
    const completeSale = cashier.slice(cashier.indexOf("const completeSale"), cashier.indexOf("const handlePosCategoryChange"));
    const submitFlow = cashier.slice(cashier.indexOf("const submitParkedInvoiceDraft"), cashier.indexOf("const resumeParkedInvoice"));
    const clearCurrent = completeSale.indexOf("clearCurrentSale()");
    const submitCall = completeSale.indexOf("submitParkedInvoiceDraft(draft)");
    const rpcCall = submitFlow.indexOf("await createCloudInvoice(");
    expect(rpcCall).toBeGreaterThanOrEqual(0);
    expect(clearCurrent).toBeGreaterThanOrEqual(0);
    expect(submitCall).toBeGreaterThan(clearCurrent);
    expect(submitFlow).toContain("catch (error)");
    expect(submitFlow).toContain("setParkedInvoices(");
    expect(cashier).toContain("الفواتير المعلقة");
    expect(cashier).toContain("استكمال الفاتورة");
    expect(cashier).toContain("حذف الفاتورة نهائياً");
    expect(parked).toContain("createInvoiceInputFromParkedDraft");
    expect(cashier).not.toContain("localStorage");
    expect(cashier).not.toContain("sessionStorage");
  });

  it("يلغي intent الفاشل المؤكد فقط ويعرض نقص المخزون كتلميح غير حاجب", () => {
    const cashier = readFileSync(resolve(root, "client/src/pages/Cashier.tsx"), "utf8");
    const invoices = readFileSync(resolve(root, "client/src/lib/supabase/invoices.ts"), "utf8");
    const submitFlow = cashier.slice(cashier.indexOf("const submitParkedInvoiceDraft"), cashier.indexOf("const resumeParkedInvoice"));
    expect(cashier).toContain("formatInvoiceCheckoutError(error)");
    expect(cashier).toContain("getInsufficientStockProductName(error)");
    expect(cashier).toContain("المخزون غير كافٍ للصنف");
    expect(cashier).toContain("cancelPendingInvoiceIntent");
    expect(submitFlow).toContain('latest.state === "pending"');
    expect(cashier).not.toContain("attemptLocked");
    expect(cashier).not.toContain("checkoutError &&");
    expect(invoices).toContain('"acknowledgment"');
    expect(invoices).toContain("invoiceResult");
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
