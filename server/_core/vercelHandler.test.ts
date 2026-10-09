import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApiApp } from "./app";
import { normalizeVercelStoragePath } from "./vercelHandler";

describe("Vercel API adapter", () => {
  it.each([
    ["/api/manus-storage/shop/product.webp", "/manus-storage/shop/product.webp"],
    ["/api/manus-storage?download=1", "/manus-storage?download=1"],
    ["/api/trpc/products.list", "/api/trpc/products.list"],
    ["/dashboard", "/dashboard"],
  ])("normalizes %s to the correct Express path", (input, expected) => {
    expect(normalizeVercelStoragePath(input)).toBe(expected);
  });

  describe("API health route", () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
      server = createServer(createApiApp());
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("API test server did not bind to a TCP address"));
            return;
          }
          origin = `http://127.0.0.1:${address.port}`;
          resolve();
        });
      });
    });

    afterAll(async () => {
      if (!server?.listening) return;
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
    });

    it("responds through the serverless API app without caching", async () => {
      const response = await fetch(`${origin}/api/health`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });

    it("does not expose the legacy OAuth callback on the Vercel app", async () => {
      const response = await fetch(`${origin}/api/oauth/callback?code=test&state=test`);
      expect(response.status).toBe(404);
    });
  });
});
