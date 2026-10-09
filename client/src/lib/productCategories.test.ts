import { describe, expect, it } from "vitest";
import { countProductsByCategory, filterProductsByCategory } from "./productCategories";

describe("product category grouping", () => {
  const products = [
    { id: "1", name: "مسحوق", category: "مساحيق" },
    { id: "2", name: "كريم", category: "مستحضرات التجميل" },
    { id: "3", name: "شكارة خامة", category: "الشكاير" },
  ];

  it("filters the list to the selected category", () => {
    expect(filterProductsByCategory(products, "مساحيق").map(product => product.name)).toEqual(["مسحوق"]);
    expect(filterProductsByCategory(products, "مستحضرات التجميل").map(product => product.name)).toEqual(["كريم"]);
    expect(filterProductsByCategory(products, "all")).toHaveLength(3);
  });

  it("counts products without moving them between categories", () => {
    expect(countProductsByCategory(products, ["مساحيق", "مستحضرات التجميل", "الشكاير", "الخامات"])).toEqual([
      { category: "مساحيق", count: 1 },
      { category: "مستحضرات التجميل", count: 1 },
      { category: "الشكاير", count: 1 },
      { category: "الخامات", count: 0 },
    ]);
  });
});
