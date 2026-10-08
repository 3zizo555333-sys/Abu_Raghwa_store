import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { LEGACY_CLOUD_KEYS } from "../client/src/components/LegacyCloudBridge";

describe("جسر المزامنة السحابية للأقسام القديمة", () => {
  it("يشمل البيانات الأساسية التي يحتاجها الموظفون بين الأجهزة", () => {
    expect(LEGACY_CLOUD_KEYS).toEqual(expect.arrayContaining([
      "abu_raghwa_sales",
      "abu_raghwa_raw_materials",
      "abu_raghwa_recipes",
      "abu_catalog_manual_products",
      "abu_catalog_categories",
      "abu_catalog_companies",
      "abu_catalog_pricing",
      "abu_raghwa_invoice_categories_v2",
      "abu_raghwa_custom_voice_commands",
      "abu_reward_levels",
      "points_system_employees",
      "abu_raghwa_shortages",
      "abu_raghwa_expenses",
      "abu_raghwa_debts",
      "abu_gift_delivery_logs",
      "abu_raghwa_scanned_invoices",
    ]));

    // حسابات الدخول تستخدم useCloudState مباشرة؛ لا يجب أن ينسخ الجسر جلسة موظف إلى هاتف آخر.
    expect(LEGACY_CLOUD_KEYS).not.toContain("abu_raghwa_users");
    expect(LEGACY_CLOUD_KEYS).not.toContain("abu_raghwa_current_user");
  });

  it("يحتفظ بالتعديل المحلي قيد المزامنة ولا يعيد تحميل الصفحة بقيمة أقدم", () => {
    const source = readFileSync(new URL("../client/src/components/LegacyCloudBridge.tsx", import.meta.url), "utf8");

    expect(source).toContain("pendingLocalValue");
    expect(source).toContain("if (pendingLocalValue.current === localValue) return;");
  });

  it("لا يرفع نسخة محلية فوق سجل سحابي موجود أثناء التحديث", () => {
    const source = readFileSync(new URL("../client/src/lib/cloudSync.ts", import.meta.url), "utf8");
    expect(source).toContain("serverData !== null");
    expect(source).toContain("serverData !== undefined");
    expect(source).toContain("if (!cloudError && serverData !== undefined && (!isLargeCollection || serverData !== null))");
  });

  it("does not let the legacy bridge read or write the canonical product collection", () => {
    const source = readFileSync(new URL("../client/src/components/LegacyCloudBridge.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('"abu_raghwa_products",');
  });
});
