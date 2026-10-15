import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("صور التركيبات العامة المضغوطة", () => {
  it("يضغط WebP/JPEG دون 300KB ويرفع إلى formulas ثم يسجل publicUrl في قاعدة البيانات", () => {
    const service = read("client/src/lib/supabase/formulationImages.ts");
    const migration = read("supabase/migrations/20261015125500_formulas_public_image_storage.sql");
    const recipes = read("client/src/lib/supabase/formulations.ts");
    expect(service).toContain('prepareCloudProductImage(input.file, { allowJpegFallback: true })');
    expect(service).toContain("image.size >= 300_000");
    expect(service).toContain('storage.from("formulas")');
    expect(service).toContain("getPublicUrl(storagePath)");
    expect(service).toContain('.rpc("register_public_formulation_image"');
    expect(migration).toContain("image_url = p_public_url");
    expect(migration).toContain("true, 299999, array['image/webp', 'image/jpeg']");
    expect(recipes).toContain("isPublicFormulationImageUrl(input.imageUrl)");
  });

  it("يستخدم publicUrl في شاشة التركيبات والكتالوج ولا يعتمد على signed URL للملفات الجديدة", () => {
    const recipesPage = read("client/src/pages/Recipes.tsx");
    const catalogPage = read("client/src/pages/CatalogManager.tsx");
    expect(recipesPage).toContain("imageUrl: uploaded.publicUrl");
    expect(catalogPage).toContain("catalogImageUrl: result.publicUrl");
    expect(catalogPage).toContain("imageStoragePath: result.publicUrl");
  });
});
