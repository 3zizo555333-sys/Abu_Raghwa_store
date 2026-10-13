import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { handleTrpcRequest } from "./trpc";
import { createFetchContext } from "../server/_core/fetchContext";
import { createContext } from "../server/_core/context";

const authMeUrl = "http://localhost/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D";

describe("Vercel native tRPC Fetch entrypoint", () => {
  it("serves public auth.me as JSON when no session headers exist", async () => {
    const response = await handleTrpcRequest(new Request(authMeUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);
    expect(await response.json()).toMatchObject({ "0": { result: { data: { json: null } } } });
  });

  it("accepts Web Headers and treats invalid optional cookies as unauthenticated", async () => {
    for (const headers of [new Headers(), new Headers({ cookie: "app_session_id=not-a-valid-session" })]) {
      const response = await handleTrpcRequest(new Request(authMeUrl, { headers }));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toMatch(/application\/json/i);
      expect(await response.json()).toMatchObject({ "0": { result: { data: { json: null } } } });
    }
  });

  it("fails closed when optional context initialization throws", async () => {
    const context = await createFetchContext(
      { req: new Request(authMeUrl), resHeaders: new Headers() },
      async () => { throw new Error("context initialization failure"); },
    );
    expect(context.user).toBeNull();
  });

  it("returns a tRPC JSON authorization error for an unauthenticated staff-session login", async () => {
    const response = await handleTrpcRequest(new Request("http://localhost/api/trpc/catalog.loginWithStaffSession?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "0": { json: null } }),
    }));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);
    expect(await response.json()).toMatchObject({ "0": { error: { json: { data: { code: "UNAUTHORIZED" } } } } });
  });

  it("keeps the session headers used by catalog and employee-finance procedures", async () => {
    const context = await createFetchContext({
      req: new Request("https://localhost/api/trpc/auth.me", { headers: {
        "x-abu-staff-session": "staff-session-placeholder",
        "x-abu-catalog-session": "catalog-session-placeholder",
        "x-abu-employee-finance-session": "finance-session-placeholder",
      } }),
      resHeaders: new Headers(),
    });
    const headers = context.req.headers as Record<string, string>;
    expect(headers["x-abu-staff-session"]).toBe("staff-session-placeholder");
    expect(headers["x-abu-catalog-session"]).toBe("catalog-session-placeholder");
    expect(headers["x-abu-employee-finance-session"]).toBe("finance-session-placeholder");
  });

  it("treats a missing headers object as an optional unauthenticated context", async () => {
    const context = await createContext({ req: { headers: undefined } } as never);
    expect(context.user).toBeNull();
  });

  it("restores a nested Vercel rewrite and returns a JSON authorization error, not a missing route", async () => {
    const response = await handleTrpcRequest(new Request("http://localhost/api/trpc.ts?__vercel_path=api%2Ftrpc%2FemployeeFinance.managerOverview"));
    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toMatch(/application\/json/i);
  });

  it("serializes logout cookies into Fetch response headers without exposing their value", async () => {
    const response = await handleTrpcRequest(new Request("http://localhost/api/trpc/auth.logout?batch=1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ "0": { json: null } }),
    }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/HttpOnly/i);
    expect(response.headers.get("set-cookie")).toMatch(/SameSite=None/i);
  });

  it("routes nested tRPC paths before the API catch-all and preserves the SPA fallback", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { routes: Array<Record<string, string>> };
    const trpc = config.routes.findIndex(route => route.src?.includes("/api/trpc"));
    const catchAll = config.routes.findIndex(route => route.src === "^/api(?:/(?<path>.*))?$" );
    const spa = config.routes.findIndex(route => route.dest === "/index.html");
    expect(trpc).toBeGreaterThanOrEqual(0);
    expect(trpc).toBeLessThan(catchAll);
    expect(catchAll).toBeLessThan(spa);
    expect(config.routes[trpc].src).toContain("(?<path>.*)");
    expect(config.routes[spa].src).toContain("api(?:/|$)");
    expect(new URL("http://localhost/employees").pathname).toBe("/employees");
  });

  it("keeps health on the dedicated Web API entrypoint", () => {
    const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as { routes: Array<Record<string, string>> };
    expect(config.routes.find(route => route.src === "^/api/health$")?.dest).toBe("/api/health.ts");
  });
});
