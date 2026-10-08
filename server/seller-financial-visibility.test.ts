import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("صلاحيات عرض البائع", () => {
  it("يختار عرض بنود الفاتورة الآمن للبائع ولا يطلب أعمدة التكلفة", () => {
    const invoices = readFileSync(resolve(projectRoot, "client/src/lib/supabase/invoices.ts"), "utf8");
    const types = readFileSync(resolve(projectRoot, "client/src/lib/supabase/database.types.ts"), "utf8");
    const itemSelect = invoices.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";

    expect(invoices).toContain('const view = manager ? "manager_invoice_items" : "seller_invoice_items"');
    expect(invoices).toContain("role !== \"seller\"");
    expect(itemSelect).toContain("unit_price_snapshot");
    expect(itemSelect).not.toContain("unit_cost_snapshot");
    expect(types).toContain('seller_invoice_items: { Row: Omit<Database["public"]["Tables"]["invoice_items"]["Row"], "unit_cost_snapshot">');
    expect(types).toContain('manager_invoice_items: { Row: Database["public"]["Tables"]["invoice_items"]["Row"]');
  });

  it("يحصر بيانات الإدارة الحساسة في الأدوار والصفحات المخولة", () => {
    const access = readFileSync(resolve(projectRoot, "client/src/lib/accessControl.ts"), "utf8");
    const gate = readFileSync(resolve(projectRoot, "client/src/components/AccessControlGate.tsx"), "utf8");
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");

    expect(access).toContain('user?.role === "manager"');
    expect(access).toContain('user.role === "manager" || user.role === "admin" || user.role === "supervisor"');
    expect(gate).toContain("if (isManager(user))");
    expect(gate).toContain("if (canViewSensitiveFinancials)");
    expect(products).toContain("if (!canViewSensitiveFinancials) return;");
    expect(dashboard).toContain("canViewSensitiveFinancials");
    expect(app).toContain("withSupervisorRole(withPasswordProtection(Reports");
    expect(app).toContain('component={withManagerRole(UserManagement)}');
    expect(app).toContain('component={withManagerRole(SecuritySettings)}');
  });
});
