import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PWA install assets", () => {
  const publicDir = resolve(process.cwd(), "client/public");

  it("contains a valid Arabic install manifest with Android icon sizes", () => {
    const manifest = JSON.parse(readFileSync(resolve(publicDir, "manifest.json"), "utf8"));
    expect(manifest.name).toContain("أبو رغوة");
    expect(manifest.start_url).toBe("/auth");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
    ]));
    expect(existsSync(resolve(publicDir, "abu-raghwa-icon-192.png"))).toBe(true);
    expect(existsSync(resolve(publicDir, "abu-raghwa-icon-512.png"))).toBe(true);
  });

  it("contains a service worker that does not block app startup", () => {
    const serviceWorker = readFileSync(resolve(publicDir, "sw.js"), "utf8");
    expect(serviceWorker).toContain("self.addEventListener(\"fetch\"");
    expect(serviceWorker).toContain("self.skipWaiting");
  });
});

