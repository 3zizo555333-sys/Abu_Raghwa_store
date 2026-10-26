import { describe, expect, it } from "vitest";
import { getTrustedCatalogImageUrl, PUBLIC_CATALOG_CACHE_KEY } from "./catalog";

describe("catalog image safety", () => {
  it("accepts app assets and the store Supabase Storage buckets", () => {
    expect(getTrustedCatalogImageUrl("/rajwa-logo.svg")).toBe("/rajwa-logo.svg");
    expect(getTrustedCatalogImageUrl("https://smkqizjpdbnbyoumgdwi.supabase.co/storage/v1/object/public/catalog-images/shop/categories/id/image.webp")).toContain("/catalog-images/");
    expect(getTrustedCatalogImageUrl("https://smkqizjpdbnbyoumgdwi.supabase.co/storage/v1/object/sign/formulas/shop/formulations/id/image.webp?token=x")).toContain("/formulas/");
  });

  it("rejects old external taxonomy and offer image sources", () => {
    expect(getTrustedCatalogImageUrl("https://images.unsplash.com/photo-1?auto=format")).toBe("");
    expect(getTrustedCatalogImageUrl("https://www.google.com/s2/favicons?domain=brand.com&sz=128")).toBe("");
    expect(getTrustedCatalogImageUrl("https://cdn-icons-png.flaticon.com/512/995/995053.png")).toBe("");
  });

  it("uses a new cache key after public display normalization", () => {
    expect(PUBLIC_CATALOG_CACHE_KEY).toBe("public-catalog-display-v5");
  });
});
