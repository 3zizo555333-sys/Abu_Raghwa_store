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
  });

  it("normalizes product writes into an explicit database payload", () => {
    const payload = toProductPayload({
      name: "  شامبو  ", code: "A1", saleMode: "unit", unit: "كرتونة", contentUnit: "قطعة",
      unitsPerPackage: 6, retailPrice: 10, wholesaleRetailPrice: 9, bulkPrice: 8, category: "عناية",
      quantity: 2,
    }) as Record<string, unknown>;

    expect(payload).toMatchObject({ name: "شامبو", code: "A1", unit_name: "كرتونة", units_per_package: 6, retail_price: 10, quantity: 2 });
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
