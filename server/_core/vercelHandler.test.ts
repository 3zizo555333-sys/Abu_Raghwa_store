import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import apiGateway from "../../api/index";
import { GET as healthGet } from "../../api/health";
import { normalizeVercelStoragePath, restoreVercelRoutedPath } from "./vercelHandler";

const vercelConfig = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8")) as {
  routes: Array<{ src?: string; dest?: string; handle?: string; methods?: string[] }>;
};

describe("Vercel API routing", () => {
  it("routes API traffic to the static dispatcher before filesystem and SPA fallback", () => {
    const apiRouteIndex = vercelConfig.routes.findIndex(route => route.dest === "/api/index.ts?__vercel_path=$path");
    const healthRouteIndex = vercelConfig.routes.findIndex(route => route.dest === "/api/health.ts");
    const filesystemIndex = vercelConfig.routes.findIndex(route => route.handle === "filesystem");
    const fallback = vercelConfig.routes.find(route => route.dest === "/index.html");

    expect(apiRouteIndex).toBeGreaterThanOrEqual(0);
    expect(healthRouteIndex).toBeGreaterThanOrEqual(0);
    expect(apiRouteIndex).toBeLessThan(filesystemIndex);
    expect(healthRouteIndex).toBeLessThan(apiRouteIndex);
    expect(vercelConfig.routes[apiRouteIndex].methods).toBeUndefined();

    const apiMatcher = new RegExp(vercelConfig.routes[apiRouteIndex].src!);
    for (const path of ["/api", "/api/health", "/api/trpc/employeeFinance.managerOverview"]) {
      expect(apiMatcher.test(path)).toBe(true);
    }
    expect(new RegExp(fallback!.src!).test("/api/trpc/employeeFinance.managerOverview")).toBe(false);
    expect(new RegExp(fallback!.src!).test("/employees")).toBe(true);
  });

  it("routes the legacy storage path through the same static function", () => {
    const storageRoute = vercelConfig.routes.find(route => route.src?.startsWith("^/manus-storage"));
    expect(storageRoute?.dest).toContain("/api/index.ts?__vercel_path=manus-storage/");
  });

  it.each([
    ["/api/manus-storage/shop/product.webp", "/manus-storage/shop/product.webp"],
    ["/api/manus-storage?download=1", "/manus-storage?download=1"],
    ["/api/trpc/products.list", "/api/trpc/products.list"],
    ["/dashboard", "/dashboard"],
  ])("normalizes legacy storage path %s", (input, expected) => {
    expect(normalizeVercelStoragePath(input)).toBe(expected);
  });

  it.each([
    ["/api/index.ts?__vercel_path=trpc/employeeFinance.managerOverview&batch=1", "/api/trpc/employeeFinance.managerOverview?batch=1"],
    ["/api/index.ts?__vercel_path=manus-storage/shop/product.webp&download=1", "/manus-storage/shop/product.webp?download=1"],
    ["/api/index.ts?__vercel_path=health", "/api/health"],
  ])("restores the routed API path from %s", (input, expected) => {
    expect(restoreVercelRoutedPath(input)).toBe(expected);
  });

  it("serves the standalone Vercel health function as JSON", async () => {
    const response = healthGet();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  describe("API gateway GET and POST requests", () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
      server = createServer((req, res) => {
        void apiGateway(
          req as unknown as Parameters<typeof apiGateway>[0],
          res as unknown as Parameters<typeof apiGateway>[1],
        );
      });
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("API gateway test server did not bind to a TCP address"));
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

    it("restores health and returns no-store JSON through the gateway", async () => {
      const response = await fetch(`${origin}/api/index.ts?__vercel_path=health`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      await expect(response.json()).resolves.toEqual({ status: "ok" });
    });

    it.each([
      ["GET", "/api/index.ts?__vercel_path=trpc/employeeFinance.managerOverview&batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D", undefined],
      ["POST", "/api/index.ts?__vercel_path=trpc/catalog.loginWithStaffSession&batch=1", JSON.stringify({ 0: { json: null } })],
    ])("serves tRPC %s requests as JSON", async (method, path, body) => {
      const response = await fetch(`${origin}${path}`, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      });
      expect(response.status).not.toBe(405);
      expect(response.headers.get("content-type")).toContain("application/json");
      await expect(response.json()).resolves.toBeTruthy();
    });

    it("does not expose the legacy OAuth callback", async () => {
      const response = await fetch(`${origin}/api/index.ts?__vercel_path=oauth/callback&code=test&state=test`);
      expect(response.status).toBe(404);
    });
  });
});
