import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("فتح تطبيقات التواصل على الهاتف", () => {
  it("يجرب التطبيق المثبت أولًا ولا يفتح الرابط الاحتياطي إلا إذا لم ينتقل الهاتف للتطبيق", () => {
    const links = readFileSync(resolve(projectRoot, "client/src/lib/socialAppLinks.ts"), "utf8");
    const settings = readFileSync(resolve(projectRoot, "client/src/pages/Settings.tsx"), "utf8");
    const dashboard = readFileSync(resolve(projectRoot, "client/src/pages/Dashboard.tsx"), "utf8");

    expect(links).toContain("whatsapp://send");
    expect(links).toContain("fb://facewebmodal");
    expect(links).toContain("instagram://user");
    expect(links).toContain('document.visibilityState === "visible"');
    expect(settings).toContain('openSocialApp("whatsapp", whatsappNumber)');
    expect(settings).toContain('openSocialApp("facebook", facebookPage)');
    expect(dashboard).toContain('getSavedSocialLinks().instagram');
  });
});
