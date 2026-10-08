import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(import.meta.dirname, "../client/src/App.tsx"), "utf8");
const homeSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/Home.tsx"), "utf8");
const paymentSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PaymentGateway.tsx"), "utf8");
const publicOfferSource = readFileSync(resolve(import.meta.dirname, "../client/src/pages/PublicOfferPage.tsx"), "utf8");

describe("حماية المسارات المالية والحساسة", () => {
  it("يحصر الشقق والنواقص والمصروفات والشيكات والائتمان بالمشرف والمدير", () => {
    expect(appSource).toContain('path={"/apartment-management"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/shortages"} component={withSupervisorRole(Shortages)}');
    expect(appSource).toContain('path={"/expenses"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/checks"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/checks-page"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/credits-suppliers"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/smart-offers"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/recipes"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/invoice-ocr"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/invoice-scanner"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/email-notifications"} component={withSupervisorRole(');
    expect(appSource).toContain('path={"/tasks-page"} component={withSupervisorRole(');
  });

  it("يعرض المستخدم والدور من عضوية Supabase لا من Web Storage", () => {
    expect(homeSource).toContain("useStaffAccess({ monitorMembership: true })");
    expect(homeSource).toContain("canViewSensitiveFinancials");
    expect(homeSource).not.toMatch(/localStorage|sessionStorage/);
  });

  it("لا يخزن مفاتيح مزود الدفع في العميل ويقيد الشاشة بالدور الإداري", () => {
    expect(appSource).toContain('path={"/payment-gateway"} component={withSupervisorRole(PaymentGateway)}');
    expect(paymentSource).not.toMatch(/localStorage|sessionStorage|apiKey|secretKey/);
    expect(paymentSource).toContain("الدفع الإلكتروني غير مهيأ");
  });

  it("لا يستعيد العرض أو العميل أو طلب الشراء من Web Storage", () => {
    expect(publicOfferSource).not.toMatch(/localStorage|sessionStorage|indexedDB/i);
    expect(publicOfferSource).toContain("trpc.offers.get.useQuery");
    expect(publicOfferSource).toContain("trpc.catalog.getPublicLoyaltyRewardLevels.useQuery");
  });
});
