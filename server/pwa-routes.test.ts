import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isPublicCustomerPath, renderPwaInstallabilityForPath } from "../shared/pwaInstallability";

describe("route-scoped PWA installability", () => {
  const sourceHtml = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");

  it.each([
    "/public-offer",
    "/public-offer/example-code",
    "/catalog-offers",
    "/catalog",
    "/loyalty",
    "/public-offer?offer=qr-test",
    "/catalog?mode=retail",
  ])("recognizes %s as a customer route", path => {
    expect(isPublicCustomerPath(path)).toBe(true);
  });

  it.each(["/", "/auth", "/dashboard", "/catalog-manager", "/offers"]) (
    "keeps %s as a staff/installable route",
    path => expect(isPublicCustomerPath(path)).toBe(false),
  );

  it("omits manifest and mobile install hints from public QR page HTML before scripts run", () => {
    const html = renderPwaInstallabilityForPath(sourceHtml, "/public-offer/qr-123");
    expect(html).not.toMatch(/rel=["']manifest["']/i);
    expect(html).not.toMatch(/name=["'](?:mobile-web-app-capable|apple-mobile-web-app-capable|apple-mobile-web-app-status-bar-style|apple-mobile-web-app-title)["']/i);
    expect(html).toContain("<title>تطبيق أبو رغوة - إدارة المحل</title>");
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain('src="/src/main.tsx"');
  });

  it("retains manifest and install metadata on staff pages", () => {
    const html = renderPwaInstallabilityForPath(sourceHtml, "/auth");
    expect(html).toContain('<link rel="manifest" href="/manifest.json" />');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
  });

  it("cancels any install-prompt event on customer paths and gates worker registration", () => {
    const clientPolicy = readFileSync(resolve(process.cwd(), "client/src/lib/pwaInstallability.ts"), "utf8");
    expect(clientPolicy).toContain("if (isPublicCustomerPath(pathname))");
    expect(clientPolicy).toContain("if (isPublicCustomerPath(window.location.pathname)) event.preventDefault()");
    expect(clientPolicy).toContain('navigator.serviceWorker.register("/sw.js", { scope: "/" })');
    expect(clientPolicy.indexOf("if (isPublicCustomerPath(pathname))")).toBeLessThan(
      clientPolicy.indexOf('navigator.serviceWorker.register("/sw.js", { scope: "/" })'),
    );
  });
});
