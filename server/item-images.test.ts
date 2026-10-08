import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("رفع صور المنتجات والتركيبات", () => {
  it("يوفر مسار تخزين صور منفصلًا ويقيد نوع وحجم الصورة", () => {
    const router = readFileSync(resolve(projectRoot, "server/routers.ts"), "utf8");
    expect(router).toContain("itemImages: router");
    expect(router).toContain("item-images/${safeItemId}");
    expect(router).toContain("productImages: router");
    expect(router).toContain("product-images/${safeProductId}");
    expect(router).toContain("await requireStaffSyncSession(ctx.req)");
    expect(router).toContain("image/webp");
    expect(router).toContain("6 * 1024 * 1024");
  });

  it("يعرض الصورة ويتيح المعرض والكاميرا لكل من المنتج والتركيبة", () => {
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const recipes = readFileSync(resolve(projectRoot, "client/src/pages/Recipes.tsx"), "utf8");
    const uploadHelper = readFileSync(resolve(projectRoot, "client/src/lib/itemImageUpload.ts"), "utf8");
    for (const page of [products, recipes]) {
      expect(page).toContain("capture=\"environment\"");
      expect(page).toContain("اختيار من المعرض");
      expect(page).toContain("catalogImageUrl");
      expect(page).toContain("accept=\"image/*\"");
    }
    expect(products).toContain("prepareProductImageForUpload");
    expect(recipes).toContain("prepareItemImageForUpload");
    expect(products).toContain("productImages.upload");
    expect(uploadHelper).toContain("convertToJpeg");
    expect(uploadHelper).toContain("DIRECT_UPLOAD_BYTES");
    expect(products).toContain("imageUrl: product.imageUrl || product.catalogImageUrl");
    expect(recipes).toContain("imageUrl: recipe.imageUrl || recipe.catalogImageUrl");
  });
});
