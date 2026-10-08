import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("large catalog repair regressions", () => {
  it("keeps the product page render bounded", () => {
    const source = read("client/src/pages/Products.tsx");
    expect(source).toContain("const visibleProducts = useMemo(() => filteredProducts.slice(0, 120)");
    expect(source).toContain("const tradeMarginSummary = useMemo");
  });

  it("uses direct server-side product image storage", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("dataUrl: z.string().min(32).max(9_000_000)");
    expect(router).toContain("storagePut(`product-images/");
  });

  it("calculates loyalty from the canonical chunked product store", () => {
    const db = read("server/db.ts");
    expect(db).toContain('const setting = await getGlobalAppSetting(key);');
    expect(db).toContain("loyaltyPoints?: number");
  });

  it("matches barcode aliases returned by Supabase and disambiguates shared codes", () => {
    const cashier = read("client/src/pages/Cashier.tsx");
    const products = read("client/src/lib/supabase/products.ts");
    const productHook = read("client/src/lib/supabase/useProducts.ts");
    expect(products).toContain('supabase.rpc("search_products_by_barcode"');
    expect(productHook).toContain("searchProductsByBarcode(input.barcode)");
    expect(cashier).toContain("findProductsByBarcode(barcodeProducts, code)");
    expect(cashier).toContain("normalizeBarcodeToken(barcodeLookup)");
    expect(read("client/src/lib/barcodes.ts")).toContain("normalizeBarcodeValues(product.barcodes)");
    expect(cashier).toContain("setBarcodeChoices(matches)");
    expect(cashier).toContain("barcodeChoices.map(product =>");
    expect(cashier).toContain("[product.barcode, ...(product.barcodes ?? [])].filter(Boolean).join");
  });

  it("keeps each product barcode in its own editable field and preserves legacy values", () => {
    const products = read("client/src/pages/Products.tsx");
    expect(products).toContain("formData.barcodes.map((barcode, index)");
    expect(products).toContain("collectProductBarcodes(formData.code, formData.barcodes)");
    expect(products).toContain("getAdditionalBarcodeSlots(product)");
    expect(products).toContain("setBarcodeScannerTarget(index)");
    expect(products).toContain("getBarcodeFieldError(formData.code, formData.barcodes)");
  });

  it("exposes label printing only in product edit and uses JsBarcode for every code", () => {
    const products = read("client/src/pages/Products.tsx");
    expect(products).toContain("{editingId && <Button type=\"button\" variant=\"outline\" onClick={printProductBarcodeLabels}");
    expect(products).toContain('JsBarcode(svg, label.barcode, { format: "CODE128"');
    expect(products).toContain("createBarcodeLabelPrintHtml(labels, barcodeSvgs)");
    expect(products).toContain("printWindow?.print()");
  });

  it("adds reversible per-item cleanup to report analytics without deleting sales data", () => {
    const reports = read("client/src/pages/Reports.tsx");
    expect(reports).toContain('const HIDDEN_REPORT_ITEMS_KEY = "abu_raghwa_hidden_report_items"');
    expect(reports).toContain("setHiddenReportItems(current => hideReportItem(current, { id, label }))");
    expect(reports).toContain("setHiddenReportItems(current => restoreReportItem(current, id))");
    expect(reports).toContain("const removeButton = (id: string, label: string)");
    expect(reports).toContain("visibleTopProducts.map");
    expect(reports).toContain("visibleLoyaltyProducts.map");
    expect(reports).toContain("visibleCustomers.map");
    expect(reports).toContain("visibleDailySales.sort");
    expect(reports).toContain("visiblePaymentMethods.map");
    expect(reports).toContain("ستبقى الفواتير والمبيعات الأصلية كما هي");
    expect(reports).not.toContain('"abu_raghwa_report_downloads"');
  });
});
