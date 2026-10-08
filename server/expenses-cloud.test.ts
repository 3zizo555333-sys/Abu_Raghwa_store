import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("مصروفات Supabase", () => {
  it("يحمّل المصروفات ويكتبها ويحذفها عبر خدمات Supabase فقط", () => {
    const page = readFileSync(resolve(projectRoot, "client/src/pages/Expenses.tsx"), "utf8");
    const service = readFileSync(resolve(projectRoot, "client/src/lib/supabase/expenses.ts"), "utf8");

    expect(page).toContain("listCloudExpenses");
    expect(page).toContain("saveCloudExpense");
    expect(page).toContain("deleteCloudExpense");
    expect(page).toContain("getCloudExpenseSummary");
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("sessionStorage");
    expect(service).toContain('.rpc("save_expense"');
    expect(service).toContain('.rpc("delete_expense"');
    expect(service).not.toContain("localStorage");
    expect(service).not.toContain("sessionStorage");
  });
});
