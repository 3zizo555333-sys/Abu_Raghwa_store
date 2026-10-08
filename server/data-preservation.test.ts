import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("حماية بيانات التطبيق أثناء التحديث والمزامنة", () => {
  it("does not expose a broad localStorage reset action", () => {
    expect(read("client/src/pages/Dashboard.tsx")).not.toContain("localStorage.clear()");
  });

  it("guards cloud collection writes against accidental empty replacement", () => {
    const db = read("server/db.ts");
    const sync = read("client/src/lib/cloudSync.ts");
    expect(db).toContain("rejectAccidentalEmptyCollectionWrite");
    expect(db).toContain("رُفض مسح مجموعة");
    expect(sync).toContain("Never let an empty bootstrap response erase a non-empty local");
  });

  it("keeps an export and backup entry available from the dashboard", () => {
    expect(read("client/src/pages/Dashboard.tsx")).toContain("/data-export-import");
    expect(read("client/src/pages/DataExportImport.tsx")).toContain("exportAllData");
  });
});
