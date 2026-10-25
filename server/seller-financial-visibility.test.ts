import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isManager } from "../client/src/lib/accessControl";

const projectRoot = resolve(import.meta.dirname, "..");

describe("صلاحيات عرض البائع", () => {
  it("يختار عرض بنود الفاتورة الآمن للبائع ولا يطلب أعمدة التكلفة", () => {
    const invoices = readFileSync(resolve(projectRoot, "client/src/lib/supabase/invoices.ts"), "utf8");
    const types = readFileSync(resolve(projectRoot, "client/src/lib/supabase/database.types.ts"), "utf8");
    const columns = invoices.match(/const columns = manager\s*\? "([^"]+)"\s*: "([^"]+)"/);

    expect(invoices).toContain('const view = manager ? "manager_invoice_items" : "seller_invoice_items"');
    expect(invoices).toContain("role !== \"seller\"");
    expect(columns?.[1]).toContain("unit_cost_snapshot");
    expect(columns?.[2]).toContain("unit_price_snapshot");
    expect(columns?.[2]).not.toContain("unit_cost_snapshot");
    expect(types).toContain('seller_invoice_items: { Row: Omit<Database["public"]["Tables"]["invoice_items"]["Row"], "unit_cost_snapshot">');
    expect(types).toContain('manager_invoice_items: { Row: Database["public"]["Tables"]["invoice_items"]["Row"]');
  });

  it("يحصر بيانات الإدارة الحساسة في الأدوار والصفحات المخولة", () => {
    const access = readFileSync(resolve(projectRoot, "client/src/lib/accessControl.ts"), "utf8");
    const gate = readFileSync(resolve(projectRoot, "client/src/components/AccessControlGate.tsx"), "utf8");
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");

    expect(access).toContain('user?.role === "manager" || user?.role === "admin"');
    expect(access).toContain('user.role === "manager" || user.role === "admin" || user.role === "supervisor"');
    expect(gate).toContain("if (isManager(user))");
    expect(gate).toContain("if (canViewSensitiveFinancials)");
    expect(products).toContain("if (!canViewSensitiveFinancials) return;");
    expect(dashboard).toContain("canViewSensitiveFinancials");
    expect(app).toContain("withSupervisorRole(withPasswordProtection(Reports");
    expect(app).toContain('component={withManagerRole(withPasswordProtection(UserManagement');
    expect(app).toContain('component={withManagerRole(SecuritySettings)}');
    expect(app).toContain('path={"/employees"} component={withManagerRole(withPasswordProtection(Employees');
  });

  it("يعامل manager وadmin كإدارة كاملة ويُبقي supervisor خارجها", () => {
    const user = (role: "manager" | "admin" | "supervisor" | "seller") => ({
      id: role,
      email: `${role}@example.com`,
      role,
      createdDate: "2026-01-01",
      lastLogin: "2026-01-01",
      deviceIds: [],
      isApproved: true,
    });
    expect(isManager(user("manager"))).toBe(true);
    expect(isManager(user("admin"))).toBe(true);
    expect(isManager(user("supervisor"))).toBe(false);
    expect(isManager(user("seller"))).toBe(false);
  });

  it("يُبقي للبائع واجهة تنقل محدودة لمسارات البيع والكتالوج والعروض العامة", () => {
    const access = readFileSync(resolve(projectRoot, "client/src/lib/sellerAccess.ts"), "utf8");
    const navigation = readFileSync(resolve(projectRoot, "client/src/components/SellerNavigation.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    expect(access).toContain('"/cashier"');
    expect(access).toContain('"/catalog"');
    expect(access).toContain('"/catalog-offers"');
    expect(access).toContain('normalized === "/public-offer"');
    expect(access).not.toContain('"/sales"');
    expect(access).not.toContain('"/smart-offers"');
    expect(navigation).toContain('label: "نقطة البيع"');
    expect(navigation).toContain('label: "الكتالوج"');
    expect(app).toContain("sellerRestricted = isSeller && !canSellerAccessPath(location)");
  });

  it("لا يطلب استعلام الكتالوج العام أعمدة التكلفة أو ملاحظات التركيبات الداخلية", () => {
    const operations = readFileSync(resolve(projectRoot, "client/src/lib/supabase/operations.ts"), "utf8");
    const displayQuery = operations.slice(operations.indexOf("export async function listPublicCatalogDisplayData"), operations.indexOf("export async function listCatalogRewards"));
    expect(displayQuery).toContain('select("id, name, unit_name, retail_price, category_name, loyalty_points, catalog_image_path, catalog_visible, catalog_price, catalog_old_price, catalog_description, catalog_details_url, catalog_category, catalog_company, catalog_loyalty_points, deleted_at")');
    expect(displayQuery).toContain('catalog_description, catalog_details_url, catalog_category, catalog_company, version, deleted_at');
    expect(displayQuery.match(/eq\("catalog_visible", true\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(displayQuery.match(/is\("deleted_at", null\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(displayQuery).not.toContain('select("*")');
    expect(displayQuery).not.toContain("cost_price");
    expect(displayQuery).not.toContain("wholesale_price_per_unit");
    expect(displayQuery).not.toContain("password_hash");
    expect(displayQuery).not.toContain("notes");
  });

  it("يفرض الرؤية الصريحة للتركيبات في القراءة العامة والواجهة", () => {
    const operations = readFileSync(resolve(projectRoot, "client/src/lib/supabase/operations.ts"), "utf8");
    const publicPage = readFileSync(resolve(projectRoot, "client/src/pages/PublicCatalogPage.tsx"), "utf8");
    expect(operations).toContain("recipeRows.filter(row => row.catalog_visible === true && row.deleted_at == null)");
    expect(publicPage).toContain("recipe.catalog_visible === true && recipe.deleted_at == null");
    expect(publicPage).toContain('const PUBLIC_CATALOG_CACHE_KEY = "public-catalog-display-v3"');
  });
});
