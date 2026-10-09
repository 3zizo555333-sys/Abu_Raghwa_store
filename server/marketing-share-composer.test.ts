import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildProfessionalPost } from "../client/src/components/MarketingShareComposer";

const projectRoot = resolve(import.meta.dirname, "..");

describe("منشئ المنشورات التسويقية", () => {
  it("يجهز منشورًا قابلًا للتعديل وخيارات واتساب وفيسبوك وإنستجرام", () => {
    const composer = readFileSync(resolve(projectRoot, "client/src/components/MarketingShareComposer.tsx"), "utf8");
    const products = readFileSync(resolve(projectRoot, "client/src/pages/Products.tsx"), "utf8");
    const recipes = readFileSync(resolve(projectRoot, "client/src/pages/Recipes.tsx"), "utf8");
    const offers = readFileSync(resolve(projectRoot, "client/src/pages/SmartOffers.tsx"), "utf8");
    expect(composer).toContain("صانع بوست إعلاني مشوق");
    expect(composer).toContain("المميزات والمواصفات التي تريد إبرازها");
    expect(composer).toContain("shareToWhatsApp");
    expect(composer).toContain("shareToFacebook");
    expect(composer).toContain("إنستجرام / اختيار تطبيق");
    expect(composer).toContain("#أبو_رغوة");
    expect(composer).toContain("صانع بوست إعلاني مشوق");
    expect(composer).toContain("رأس الإعلان");
    expect(composer).toContain("المميزات والمواصفات");
    expect(products).toContain("MarketingShareButton");
    expect(recipes).toContain("MarketingShareButton");
    expect(offers).toContain("MarketingShareButton");
  });

  it("يكتب صياغة مختلفة من رأس المنتج ومميزاته الحقيقية", () => {
    const post = buildProfessionalPost({ kind: "product", title: "بوكس ورد", price: 150, unit: "كيلو" }, "بوكس برائحة الورد 1 كيلو", "رائحة هادئة، عبوة اقتصادية", "exciting");
    expect(post).toContain("بوكس برائحة الورد 1 كيلو");
    expect(post).toContain("رائحة هادئة");
    expect(post).toContain("١٥٠");
    expect(post).toContain("ليه هتحبه؟");
  });

  it("يعيد الصياغة بنسخة مختلفة ولا ينتج منشورًا من كلمتين عند غياب المميزات", () => {
    const source = { kind: "offer" as const, title: "عرض الأسبوع", price: 99 };
    const first = buildProfessionalPost(source, source.title, "", "exciting", 0);
    const rewritten = buildProfessionalPost(source, source.title, "", "exciting", 1);
    expect(rewritten).not.toBe(first);
    expect(rewritten.length).toBeGreaterThan(250);
    expect(rewritten).toContain("ليه هتحبه؟");
    expect(rewritten).toContain("#اختيارك_الأفضل");
  });
});
