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
    expect(page).toContain("getCloudExpenseSummaryFallback");
    expect(page).toContain("summaryNotice");
    expect(page).not.toContain("localStorage");
    expect(page).not.toContain("sessionStorage");
    expect(service).toContain('.rpc("save_expense"');
    expect(service).toContain('.rpc("delete_expense"');
    expect(service).toContain('.rpc("get_expense_summary"');
    expect(service).toContain('.from("invoice_items")');
    expect(service).not.toContain("localStorage");
    expect(service).not.toContain("sessionStorage");
  });

  it("uploads receipts through the private compressed feature-image pipeline", () => {
    const page = readFileSync(resolve(projectRoot, "client/src/pages/Expenses.tsx"), "utf8");
    const imageService = readFileSync(resolve(projectRoot, "client/src/lib/supabase/featureImages.ts"), "utf8");
    const compressor = readFileSync(resolve(projectRoot, "client/src/lib/supabase/prepareProductImage.ts"), "utf8");
    expect(page).toContain('uploadShopFeatureImage({ featureType: "expense"');
    expect(imageService).toContain("prepareCloudProductImage(input.file, { allowJpegFallback: true })");
    expect(imageService).toContain("image.size >= 300_000");
    expect(compressor).toContain('"image/webp"');
    expect(compressor).toContain('"image/jpeg"');
  });
});
