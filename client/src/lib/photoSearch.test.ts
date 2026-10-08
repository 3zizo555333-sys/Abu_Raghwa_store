import { describe, expect, it } from "vitest";
import { getPhotoCandidatePayload, getPhotoFallbackProducts, getPhotoMatchProduct, getProductPrice } from "./photoSearch";

describe("photo product lookup", () => {
  const products = [
    { id: "oil-1", name: "زيت روزماري", code: "63012453853", catalogImageUrl: "https://example.com/oil.jpg", retailPrice: 75 },
    { id: "powder-1", name: "مسحوق", code: "", retailPrice: 40 },
  ];

  it("sends the saved product image as a visual reference", () => {
    expect(getPhotoCandidatePayload(products)).toEqual([
      { id: "oil-1", name: "زيت روزماري", code: "63012453853", imageUrl: "https://example.com/oil.jpg" },
      { id: "powder-1", name: "مسحوق", code: "", imageUrl: undefined },
    ]);
  });

  it("accepts a useful visual match but rejects an uncertain one", () => {
    expect(getPhotoMatchProduct(products, "oil-1", 0.34)).toBeNull();
    expect(getPhotoMatchProduct(products, "oil-1", 0.54)?.name).toBe("زيت روزماري");
  });

  it("returns saved product photos immediately as a safe fallback", () => {
    expect(getPhotoFallbackProducts(products)).toHaveLength(1);
    expect(getPhotoFallbackProducts(products)[0].id).toBe("oil-1");
  });

  it("uses the same retail price shown by the cashier", () => {
    expect(getProductPrice(products[0])).toBe(75);
  });
});
