import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("مداخل جرد المبيعات والأرباح", () => {
  it("يظهر مدخل الجرد في لوحة التحكم وإدارة الكتالوج ويرتبط بالمسار المحمي", () => {
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");
    const catalogManager = readFileSync(resolve(projectRoot, "client/src/pages/CatalogManager.tsx"), "utf8");

    expect(app).toContain('path={"/advanced-reports"}');
    expect(dashboard).toContain("جرد المبيعات والأرباح");
    expect(catalogManager).toContain("جرد المبيعات والأرباح");
  });
});
