import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("اختيار نوع البيع داخل تسجيل مبيعة", () => {
  it("يعرض خيار البيع العادي والكاشير داخل صفحة المبيعات", () => {
    const sales = readFileSync(resolve(projectRoot, "client/src/pages/Sales.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");

    expect(sales).toContain('saleMode === "choose"');
    expect(sales).toContain("بيع عادي");
    expect(sales).toContain("بيع كاشير");
    expect(dashboard).toContain('navigate("/sales")');
    expect(dashboard.match(/navigate\("\/sales"\)/g)).toHaveLength(1);
    expect(dashboard).not.toContain("تسجيل مبيعة: عادي أو كاشير");
  });
});
