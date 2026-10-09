import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGACY_CLOUD_KEYS } from "../client/src/components/LegacyCloudBridge";

const bridgeSource = readFileSync(new URL("../client/src/components/LegacyCloudBridge.tsx", import.meta.url), "utf8");

describe("إيقاف جسر البيانات القديم", () => {
  it("لا يحتفظ بقائمة مفاتيح أعمال للمزامنة القديمة", () => {
    expect(LEGACY_CLOUD_KEYS).toEqual([]);
  });

  it("لا يقرأ أو يكتب المتصفح ولا يستدعي sync snapshots", () => {
    expect(bridgeSource).not.toMatch(/localStorage|sessionStorage|indexedDB|Storage\.prototype/);
    expect(bridgeSource).not.toContain("trpc.sync");
    expect(bridgeSource).toContain("return null");
  });
});
