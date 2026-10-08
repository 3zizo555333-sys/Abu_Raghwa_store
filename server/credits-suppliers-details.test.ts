import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("تفاصيل حركات الأجل والموردين", () => {
  it("يسجل تفاصيل الرصيد الأولي والحركة ويزيل مدخل الأجل الكناش", () => {
    const page = readFileSync(resolve(projectRoot, "client/src/pages/CreditsAndSuppliersAdvanced.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");
    const app = readFileSync(resolve(projectRoot, "client/src/App.tsx"), "utf8");

    expect(page).toContain("initialDetails");
    expect(page).toContain("ما الذي أخذه العميل؟");
    expect(page).toContain("ما الذي أخذته من المورد؟");
    expect(page).toContain("تفاصيل الدفعة وما تم دفعه مقابله");
    expect(page).toContain("التفاصيل:");
    expect(page).toContain("!transactionData.description.trim()");
    expect(dashboard).not.toContain('navigate("/credit")');
    expect(app).not.toContain('path={"/credit"}');
  });
});
