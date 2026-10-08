import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("صلاحيات عرض البائع", () => {
  it("يمنع بيانات التكلفة والربح عن البائع ويتيحها للمشرف", () => {
    const accessHook = readFileSync(resolve(projectRoot, "client/src/hooks/useStaffAccess.ts"), "utf8");
    const gate = readFileSync(resolve(projectRoot, "client/src/components/AccessControlGate.tsx"), "utf8");
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const recipes = readFileSync(resolve(projectRoot, "client/src/pages/Recipes.tsx"), "utf8");
    const smartOffers = readFileSync(resolve(projectRoot, "client/src/pages/SmartOffers.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");
    const loyaltyPage = readFileSync(resolve(projectRoot, "client/src/pages/LoyaltyPage.tsx"), "utf8");

    expect(accessHook).toContain('user?.role === "seller"');
    expect(accessHook).toContain('user?.role === "manager" || user?.role === "admin"');
    expect(gate).toContain("withSupervisorRole");
    expect(products).toContain("if (isSeller)");
    expect(products).toContain("المنتجات وأسعار البيع");
    expect(products).toContain("سعر البيع بالجملة");
    expect(recipes).toContain("التركيبات وأسعار البيع");
    expect(smartOffers).toContain("العروض المتاحة للبيع");
    expect(smartOffers).toContain("التوفير للعميل");
    expect(app).toContain("withSupervisorRole");
    expect(dashboard).toContain("canViewSensitiveFinancials");
    expect(app).toContain("withManagerRole(withPasswordProtection(Reports");
    expect(gate).toContain("هذه الصفحة للمدير فقط");
    expect(loyaltyPage).not.toContain("تكلفة المنتجات");
    expect(loyaltyPage).not.toContain("صافي الربح");
  });
});
