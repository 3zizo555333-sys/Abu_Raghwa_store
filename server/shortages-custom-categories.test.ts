import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("فئات النواقص المخصصة", () => {
  it("يحفظ الفئة التي يضيفها المدير ويعرضها مع الفئات الافتراضية", () => {
    const shortagesPage = readFileSync(resolve(projectRoot, "client/src/pages/Shortages.tsx"), "utf8");
    const cloudBridge = readFileSync(resolve(projectRoot, "client/src/components/LegacyCloudBridge.tsx"), "utf8");

    expect(shortagesPage).toContain('SHORTAGE_CATEGORIES_STORAGE_KEY = "abu_raghwa_shortage_categories"');
    expect(shortagesPage).toContain("handleAddCustomCategory");
    expect(shortagesPage).toContain("إضافة فئة");
    expect(shortagesPage).toContain("إضافة فئة جديدة للنواقص");
    expect(shortagesPage).toContain("Array.from(new Set([...DEFAULT_CATEGORIES, ...customCategories]))");
    expect(shortagesPage).toContain("categories.map(category");
    expect(cloudBridge).toContain('"abu_raghwa_shortage_categories"');
  });
});
