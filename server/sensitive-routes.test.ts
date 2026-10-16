import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(import.meta.dirname, "../client/src/App.tsx"), "utf8");
const registrySource = readFileSync(resolve(import.meta.dirname, "../client/src/lib/supabase/screenPinRegistry.ts"), "utf8");
const homeSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Home.tsx"), "utf8");
const paymentSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PaymentGateway.tsx"), "utf8");
const publicOfferSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PublicOfferPage.tsx"), "utf8");
const sellerAccessSource = readFileSync(resolve(import.meta.dirname, "../client/src/lib/sellerAccess.ts"), "utf8");

const registryEntries = [...registrySource.matchAll(/^[ \t]*\["([^\"]+)", "([^\"]+)",/gm)];
const expectedKey = (path: string) => `screen__${path.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "root"}`;

describe("حماية المسارات المالية والحساسة", () => {
  it("يحافظ على قيود الأدوار في المسارات الحساسة", () => {
    expect(appSource).toContain('path={"/apartment-management"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/shortages"} component={withSupervisorRole(withPasswordProtection(Shortages');
    expect(appSource).toContain('path={"/expenses"} component={withManagerRole(');
    expect(appSource).toContain('path={"/checks"} component={withManagerRole(');
    expect(appSource).toContain('path={"/checks-page"} component={withManagerRole(');
    expect(appSource).toContain('path={"/credits-suppliers"} component={withManagerRole(');
    expect(appSource).toContain('path={"/smart-offers"} component={withManagerRole(');
    expect(appSource).toContain('path={"/suppliers"} component={withManagerRole(');
    expect(appSource).toContain('path={"/recipes"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/invoice-ocr"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/invoice-scanner"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/email-notifications"} component={withManagerRole(');
    expect(appSource).toContain('path={"/tasks-page"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/employees"} component={withManagerRole(withPasswordProtection(Employees');
    expect(appSource).toContain('path={"/products"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/sales"} component={withPasswordProtection(');
    expect(appSource).toContain('path={"/cashier"} component={withPasswordProtection(');
  });

  it("assigns every internal registered route a unique screen-specific PIN key", () => {
    const keys = registryEntries.map(match => expectedKey(match[1]));
    expect(keys.length).toBeGreaterThan(40);
    expect(new Set(keys).size).toBe(keys.length);
    const registeredPaths = new Set(registryEntries.map(match => match[1]));
    const exemptPaths = new Set(["/auth", "/security-settings", "/public-offer", "/catalog-offers", "/catalog", "/loyalty", "/customer-display", "/led-display", "404"]);
    const appPaths = [...appSource.matchAll(/<Route path=\{"([^\"]+)"\} component=/g)].map(match => match[1]);
    expect(appPaths.filter(path => !exemptPaths.has(path) && !registeredPaths.has(path))).toEqual([]);
    for (const match of registryEntries) {
      const path = match[1];
      const route = appSource.split("\n").find(line => line.includes(`path={"${path}"} component={`));
      expect(route).toBeDefined();
      expect(route).toContain(`'${expectedKey(path)}'`);
      expect(route).toContain("withPasswordProtection(");
    }
    expect(appSource).toContain('path={"/auth"} component={Auth}');
    expect(appSource).toContain('path={"/security-settings"} component={withManagerRole(SecuritySettings)}');
    expect(appSource).toContain('path={"/loyalty"} component={LoyaltyPage}');
  });

  it("يعرض المستخدم والدور من عضوية Supabase لا من Web Storage", () => {
    expect(homeSource).toContain("useStaffAccess({ monitorMembership: true })");
    expect(homeSource).toContain("canViewSensitiveFinancials");
    expect(homeSource).not.toMatch(/localStorage|sessionStorage/);
  });

  it("يقصر البائع على نقطة البيع والكتالوج والعروض العامة ويحجب صفحات الإدارة", () => {
    expect(appSource).toContain("canSellerAccessPath(location)");
    expect(appSource).toContain('user?.role === "seller"');
    expect(appSource).toContain('navigate("/cashier")');
    expect(sellerAccessSource).toContain('"/cashier"');
    expect(sellerAccessSource).toContain('"/catalog"');
    expect(sellerAccessSource).toContain('"/catalog-offers"');
    expect(sellerAccessSource).not.toContain('"/sales"');
    expect(sellerAccessSource).not.toContain('"/smart-offers"');
  });

  it("لا يخزن مفاتيح مزود الدفع في العميل ويقيد الشاشة بالدور الإداري", () => {
    expect(appSource).toContain('path={"/payment-gateway"} component={withManagerRole(withPasswordProtection(PaymentGateway');
    expect(paymentSource).not.toMatch(/localStorage|sessionStorage|apiKey|secretKey/);
    expect(paymentSource).toContain("الدفع الإلكتروني غير مهيأ");
  });

  it("لا يستعيد العرض أو العميل أو طلب الشراء من Web Storage", () => {
    expect(publicOfferSource).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(publicOfferSource).toContain("trpc.offers.get.useQuery");
    expect(publicOfferSource).toContain("trpc.catalog.getPublicLoyaltyRewardLevels.useQuery");
  });
});
