import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("حماية المسميات العربية", () => {
  it("يعرّف الصفحة كتطبيق عربي ويمنع الترجمة التلقائية", () => {
    const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
    expect(html).toContain('<html lang="ar" dir="rtl" translate="no"');
    expect(html).toContain('name="google" content="notranslate"');
    expect(html).toContain('id="root" class="notranslate" translate="no"');
  });
});
