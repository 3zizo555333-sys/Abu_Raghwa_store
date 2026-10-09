import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("سجلات الشيكات في Supabase", () => {
  it("يحفظ الشيكات البنكية والقيود الآجلة سحابيًا دون Web Storage", () => {
    const bankPage = readFileSync(resolve(projectRoot, "client/src/pages/Checks.tsx"), "utf8");
    const deferredPage = readFileSync(resolve(projectRoot, "client/src/pages/ChecksPage.tsx"), "utf8");
    const service = readFileSync(resolve(projectRoot, "client/src/lib/supabase/checks.ts"), "utf8");

    for (const source of [bankPage, deferredPage]) {
      expect(source).not.toContain("localStorage");
      expect(source).not.toContain("sessionStorage");
      expect(source).not.toContain("indexedDB");
    }
    expect(bankPage).toContain("saveCloudBankCheck");
    expect(bankPage).toContain("deleteCloudBankCheck");
    expect(deferredPage).toContain("createCloudDeferredCheck");
    expect(deferredPage).toContain("deleteCloudDeferredCheck");
    expect(service).toContain('.rpc("save_bank_check"');
    expect(service).toContain('.rpc("create_deferred_check_record"');
    expect(service).toContain("subscribeToCheckChanges");
  });
});
