import { afterEach, describe, expect, it, vi } from "vitest";
import { assertCloudOnline, CloudUnavailableError, requireCloudResult } from "./client";
import { mapProductRow, toProductPayload } from "./products";

afterEach(() => vi.unstubAllGlobals());

describe("Supabase product boundary", () => {
  it("maps database records to the client shape without inventing missing seller cost fields", () => {
    const product = mapProductRow({
      id: "p-1", shop_id: "s-1", name: "صابون", code: null, barcode: null, barcodes: [], plu: null,
      sale_mode: "unit", unit_name: "كرتونة", content_unit: "قطعة", units_per_package: 12,
      retail_price: 20, wholesale_retail_price: 18, bulk_price: 17, category_name: "منظفات",
      quantity: 3, min_quantity: 1, loyalty_points: 2, version: 4, created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    }, "s-1");

    expect(product).toMatchObject({ id: "p-1", shopId: "s-1", name: "صابون", quantity: 3, version: 4 });
    expect(product.costPerUnit).toBeUndefined();
    expect(product.wholesalePricePerUnit).toBeUndefined();
    expect(product.costPerPiece).toBeUndefined();
    expect(product.bulkProfitPercent).toBeUndefined();
    expect(product.retailProfitPercent).toBeUndefined();
  });

  it("maps manager-only cost, profit, category and image metadata when the RPC returns them", () => {
    const product = mapProductRow({
      id: "p-2", name: "منظف", code: "A2", barcode: "123", barcodes: ["123", "124"], plu: "PLU-2",
      sale_mode: "unit", unit_name: "كرتونة", content_unit: "قطعة", units_per_package: 6,
      wholesale_price_per_unit: 60, wholesale_price_per_piece: 10, retail_price: 15, wholesale_retail_price: 14,
      bulk_price: 12, cost_per_unit: 60, cost_per_piece: 10, bulk_profit_percent: 20, retail_profit_percent: 40,
      category_id: "cat-1", category_name: "منظفات", quantity: 5, min_quantity: 1,
      image_id: "img-1", catalog_image_path: "shop/products/p-2/img.webp", loyalty_points: 3,
      version: 7, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
    }, "shop-1");

    expect(product).toMatchObject({
      id: "p-2", barcode: "123", barcodes: ["123", "124"], categoryId: "cat-1", category: "منظفات",
      imageId: "img-1", imageStoragePath: "shop/products/p-2/img.webp", version: 7,
      costPerUnit: 60, costPerPiece: 10, bulkProfitPercent: 20, retailProfitPercent: 40,
    });
  });

  it("normalizes product writes into an explicit database payload", () => {
    const payload = toProductPayload({
      name: "  شامبو  ", code: "A1", saleMode: "unit", unit: "كرتونة", contentUnit: "قطعة",
      unitsPerPackage: 6, retailPrice: 10, wholesaleRetailPrice: 9, bulkPrice: 8, category: "عناية", categoryId: "cat-3",
      quantity: 2,
    }) as Record<string, unknown>;

    expect(payload).toMatchObject({ name: "شامبو", code: "A1", unit_name: "كرتونة", units_per_package: 6, retail_price: 10, quantity: 2, category_id: "cat-3", category_name: "عناية" });
    expect(payload).not.toHaveProperty("password");
    expect(payload).not.toHaveProperty("imageUrl");
  });

  it("refuses to queue a business write while offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(assertCloudOnline).toThrow(CloudUnavailableError);
    expect(assertCloudOnline).toThrow("لم تُخزّن أي تغييرات محليًا");
  });

  it("does not treat an empty server response as a confirmed save", () => {
    expect(() => requireCloudResult({ data: null, error: null })).toThrow(CloudUnavailableError);
    expect(() => requireCloudResult({ data: null, error: { message: "denied" } })).toThrow("denied");
    expect(() => requireCloudResult({ data: null, error: { message: "Failed to fetch" } })).toThrow(CloudUnavailableError);
    expect(requireCloudResult({ data: 0, error: null })).toBe(0);
  });
});
