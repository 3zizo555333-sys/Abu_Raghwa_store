import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { splitIntoBatches, CLOUD_RECORD_BATCH_SIZE } from "./db";

describe("large catalog synchronization", () => {
  it("splits a 10,000-product collection into bounded database batches", () => {
    const products = Array.from({ length: 10_000 }, (_, index) => ({ id: `product-${index}` }));
    const batches = splitIntoBatches(products);

    expect(batches).toHaveLength(Math.ceil(products.length / CLOUD_RECORD_BATCH_SIZE));
    expect(Math.max(...batches.map(batch => batch.length))).toBeLessThanOrEqual(CLOUD_RECORD_BATCH_SIZE);
    expect(batches.flat()).toHaveLength(products.length);
    expect(batches.flat()[0]).toEqual(products[0]);
    expect(batches.flat().at(-1)).toEqual(products.at(-1));
  });

  it("refreshes shared product keys promptly instead of waiting for a stale minute-old cache", () => {
    const source = readFileSync(new URL("../client/src/lib/cloudSync.ts", import.meta.url), "utf8");
    expect(source).toContain("staleTime: PUBLIC_SYNC_KEYS.has(key) ? 10_000 : 20_000");
    expect(source).toContain("PUBLIC_SYNC_KEYS.has(key) ? 5_000 : 30_000");
    expect(source).toContain('refetchOnMount: "always"');
  });
});
