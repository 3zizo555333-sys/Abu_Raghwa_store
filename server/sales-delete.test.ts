import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("حذف المبيعات من السجل", () => {
  it("ينشئ الفواتير ويحمّل سجلها من واجهات Supabase الحالية", () => {
    const source = readFileSync(resolve(projectRoot, "client/src/pages/Sales.tsx"), "utf8");
    const invoices = readFileSync(resolve(projectRoot, "client/src/lib/supabase/invoices.ts"), "utf8");

    expect(source).toContain("createCloudInvoice");
    expect(source).toContain("await createCloudInvoice(pendingInvoiceRef.current.payload)");
    expect(source).toContain("listCloudInvoices(offset, PAGE_SIZE)");
    expect(invoices).toContain('supabase.rpc("create_invoice_with_stock"');
    expect(invoices).toContain('.from("invoices")');
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain('"abu_raghwa_sales"');
  });

  it("لا يحذف فاتورة سحابية أو يعيد كتابتها من snapshot محلية", () => {
    const source = readFileSync(resolve(projectRoot, "client/src/pages/Sales.tsx"), "utf8");

    expect(source).toContain("إرجاع الفواتير وحذفها غير متاحين");
    expect(source).not.toContain("handleDeleteSale");
    expect(source).not.toContain("deleteCloudInvoice");
    expect(source).not.toContain("updatedSales");
    expect(source).not.toContain("localStorage");
  });
});
