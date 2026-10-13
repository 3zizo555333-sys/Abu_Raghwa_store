import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(import.meta.dirname, "../client/src/App.tsx"), "utf8");
const homeSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Home.tsx"), "utf8");
const paymentSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PaymentGateway.tsx"), "utf8");
const publicOfferSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PublicOfferPage.tsx"), "utf8");

describe("حماية المسارات المالية والحساسة", () => {
  it("يحصر العمليات التشغيلية بالمشرف، والبيانات المالية والإدارية بالمدير", () => {
    expect(appSource).toContain('path={"/apartment-management"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/shortages"} component={withSupervisorRole(Shortages)}');
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
    expect(appSource).toContain('path={"/employees"} component={withManagerRole(withPasswordProtection(Employees, \'employees\'');
    expect(appSource).toContain('path={"/products"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/sales"} component={withPasswordProtection(');
    expect(appSource).toContain('path={"/cashier"} component={withPasswordProtection(');
    expect(appSource).toContain('path={"/loyalty"} component={LoyaltyPage}');
  });

  it("يربط أقفال PIN السحابية بالأقسام السبعة المطلوبة", () => {
    expect(appSource).toContain("'financial_reports', 'التقارير المالية والأرباح'");
    expect(appSource).toContain("'settings', 'الإعدادات'");
    expect(appSource).toContain("'employees', 'إدارة الموظفين'");
    expect(appSource).toContain("'materials', 'قائمة التركيبات وتكاليفها'");
    expect(appSource).toContain("'suppliers', 'الموردين والخامات'");
    expect(appSource).toContain("'backup', 'النسخ الاحتياطي وتصدير البيانات'");
    expect(appSource).toContain("'expenses', 'إدارة المصاريف'");
  });

  it("يعرض المستخدم والدور من عضوية Supabase لا من Web Storage", () => {
    expect(homeSource).toContain("useStaffAccess({ monitorMembership: true })");
    expect(homeSource).toContain("canViewSensitiveFinancials");
    expect(homeSource).not.toMatch(/localStorage|sessionStorage/);
  });

  it("يقصر حساب البائع على البيع والكاشير ونقاط العملاء", () => {
    expect(appSource).toContain('new Set(["/sales", "/cashier", "/loyalty"])');
    expect(appSource).toContain('user?.role === "seller"');
    expect(appSource).toContain('navigate("/cashier")');
  });

  it("لا يخزن مفاتيح مزود الدفع في العميل ويقيد الشاشة بالدور الإداري", () => {
    expect(appSource).toContain('path={"/payment-gateway"} component={withManagerRole(withPasswordProtection(PaymentGateway, \'settings\'');
    expect(paymentSource).not.toMatch(/localStorage|sessionStorage|apiKey|secretKey/);
    expect(paymentSource).toContain("الدفع الإلكتروني غير مهيأ");
  });

  it("لا يستعيد العرض أو العميل أو طلب الشراء من Web Storage", () => {
    expect(publicOfferSource).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(publicOfferSource).toContain("trpc.offers.get.useQuery");
    expect(publicOfferSource).toContain("trpc.catalog.getPublicLoyaltyRewardLevels.useQuery");
  });
});
