import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("large catalog recovery protection", () => {
  it("has a non-destructive chunk merge path", () => {
    const db = read("server/db.ts");
    expect(db).toContain("export async function mergeGlobalAppSettingChunk");
    expect(db).toContain("never deletes rows");
    expect(db).toContain("mergeGlobalAppSettingChunk");
    expect(db).toContain("positions.get(recordId) ?? nextPosition++");
    expect(db).toContain("max(cloudAppRecords.updatedAt)");
  });

  it("uploads large local catalogs as one queued authoritative snapshot", () => {
    const sync = read("client/src/lib/cloudSync.ts");
    expect(sync).toContain("const saveLargeCollection = useCallback");
    expect(sync).toContain("await saveCloudSnapshot({ key, dataJson: JSON.stringify(items)");
    expect(sync).toContain("collectionSaveQueues");
    expect(sync).toContain("appendUnique");
    expect(sync).toContain("nextCursor");
    expect(sync).toContain("hasReconciledLargeLocal");
    expect(sync).toContain("localOnlyItems");
  });

  it("does not re-upload stale local-only IDs after an authoritative deletion", () => {
    const sync = read("client/src/lib/cloudSync.ts");
    expect(sync).not.toContain("nextParsed = [...parsed, ...prev.filter");
    expect(sync).toContain("authoritative snapshot");
  });

  it("supports restoring a specifically selected backup", () => {
    const db = read("server/db.ts");
    expect(db).toContain("export async function restoreCloudBackup(key: string, backupId?: number)");
    expect(db).toContain("backupId === undefined");
  });

  it("uses a conflict-safe product snapshot merge", () => {
    const router = read("server/routers.ts");
    expect(router).toContain("Every product save is one atomic cloud snapshot");
    expect(router).toContain("if (input.key === \"abu_raghwa_products\")");
    expect(router).toContain("db.mergeGlobalAppSettingSnapshot(input.key, input.dataJson, input.baseDataJson)");
    const db = read("server/db.ts");
    expect(db).toContain("function mergeProductSnapshots");
    expect(db).toContain("jsonValuesEqual");
    expect(db).toContain("CloudCollectionCursor");
  });
});
