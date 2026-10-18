import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "..");

describe("رفع صور المنتجات والتركيبات", () => {
  it("يرفع صورة المنتج كـ Blob مباشرة إلى Supabase Storage مع تسجيلها سحابيًا", () => {
    const router = readFileSync(resolve(projectRoot, "server/routers.ts"), "utf8");
    const productsApi = readFileSync(resolve(projectRoot, "client/src/lib/supabase/products.ts"), "utf8");
    const productsPage = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    expect(router).toContain("itemImages: router");
    expect(router).toContain("item-images/${safeItemId}");
    expect(router).toContain("image/webp");
    expect(router).toContain("6 * 1024 * 1024");
    expect(productsApi).toContain('supabase.storage.from("product-images").upload(storagePath, input.blob');
    expect(productsApi).toContain('supabase.rpc("register_product_image"');
    expect(productsApi).toContain("5 * 1024 * 1024");
    expect(productsApi).not.toContain("dataUrl");
    expect(productsPage).toContain("uploadProductImage({ productId: saved.id");
    expect(productsPage).toContain("blob: pendingImage.blob");
  });

  it("يعرض الصورة ويتيح المعرض والكاميرا لكل من المنتج والتركيبة", () => {
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const recipes = readFileSync(resolve(projectRoot, "client/src/pages/Recipes.tsx"), "utf8");
    const uploadHelper = readFileSync(resolve(projectRoot, "client/src/lib/itemImageUpload.ts"), "utf8");
    const formulationImages = readFileSync(resolve(projectRoot, "client/src/lib/supabase/formulationImages.ts"), "utf8");
    const posFormulations = readFileSync(resolve(projectRoot, "client/src/lib/supabase/usePosFormulations.ts"), "utf8");
    for (const page of [products, recipes]) {
      expect(page).not.toContain("capture=\"environment\"");
      expect(page).toContain("catalogImageUrl");
      expect(page).toContain("accept=\"image/*\"");
    }
    expect(recipes).toContain("المعرض");
    expect(formulationImages).toContain('storage.from("product-images")');
    expect(formulationImages).toContain('upload(storagePath, image');
    expect(formulationImages).toContain('createSignedUrls(paths');
    expect(posFormulations).toContain("getSignedFormulationImageUrls");
    expect(products).toContain("prepareProductImageForUpload");
    expect(products).toContain("uploadProductImage({ productId: saved.id");
    expect(recipes).toContain("uploadCloudFormulationImage");
    expect(uploadHelper).toContain("convertToJpeg");
    expect(uploadHelper).toContain("DIRECT_UPLOAD_BYTES");
    expect(products).toContain("imageUrl: product.imageUrl || product.catalogImageUrl");
    expect(recipes).toContain("imageUrl: recipe.imageUrl || recipe.catalogImageUrl");
  });
});
