import { afterEach, describe, expect, it, vi } from "vitest";
import { validatedTrpcFetch } from "./validatedTrpcFetch";

afterEach(() => vi.unstubAllGlobals());

describe("validatedTrpcFetch", () => {
  it("returns a valid JSON response without consuming its body", async () => {
    const response = new Response('{"result":{"data":{"json":{"ok":true}}}}', {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));

    const actual = await validatedTrpcFetch("/api/trpc/test");
    await expect(actual.json()).resolves.toEqual({ result: { data: { json: { ok: true } } } });
  });

  it("reports an empty error response before the client tries to parse JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 502 })));

    await expect(validatedTrpcFetch("/api/trpc/test")).rejects.toThrow(/استجابة.*فارغة|دون تفاصيل/);
  });

  it("reports a non-JSON proxy response clearly", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Bad Gateway", {
      status: 502,
      headers: { "content-type": "text/html" },
    })));

    await expect(validatedTrpcFetch("/api/trpc/test")).rejects.toThrow(/غير JSON/);
  });

  it("reports malformed JSON without surfacing the browser's JSON exception", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{", {
      status: 200,
      headers: { "content-type": "application/json" },
    })));

    await expect(validatedTrpcFetch("/api/trpc/test")).rejects.toThrow(/غير مكتملة أو غير صالحة/);
  });
});
