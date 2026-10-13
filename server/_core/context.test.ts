import { describe, expect, it } from "vitest";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { createContext } from "./context";

describe("createContext optional authentication", () => {
  const optionsFor = (req: unknown): CreateExpressContextOptions => ({
    req: req as CreateExpressContextOptions["req"],
    res: {} as CreateExpressContextOptions["res"],
  });

  it.each([
    ["missing headers", { headers: undefined }],
    ["Web Headers object", { headers: new Headers() }],
    ["invalid session cookie", { headers: { cookie: "session=not-a-jwt" } }],
  ])("returns an anonymous context for %s without throwing", async (_label, req) => {
    await expect(createContext(optionsFor(req))).resolves.toMatchObject({
      user: null,
      req,
    });
  });
});
