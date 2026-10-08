import { afterEach, describe, expect, it, vi } from "vitest";

const { mockRpc, membershipQuery } = vi.hoisted(() => {
  const query: any = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.limit = vi.fn(async () => ({
    data: [{ shop_id: "shop-1", role: "seller", status: "active" }],
    error: null,
  }));
  return { mockRpc: vi.fn(), membershipQuery: query };
});

vi.mock("./client", () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { user: { id: "user-1" } } }, error: null }) },
    from: () => membershipQuery,
    rpc: mockRpc,
  }),
  requireCloudResult: (result: { data: unknown; error: { message: string } | null }) => {
    if (result.error) throw new Error(result.error.message);
    if (result.data == null) throw new Error("empty result");
    return result.data;
  },
}));

import { searchProductsByBarcode } from "./products";

afterEach(() => {
  vi.clearAllMocks();
});

describe("Supabase exact barcode search", () => {
  it("uses the bounded RPC for primary/secondary codes and maps seller-safe rows", async () => {
    mockRpc.mockResolvedValue({
      data: [{
        id: "p-1", shop_id: "shop-1", name: "صابون", barcode: "123", barcodes: ["123", "124"],
        plu: "PLU-1", sale_mode: "unit", unit_name: "عبوة", content_unit: "قطعة", units_per_package: 1,
        retail_price: 20, wholesale_retail_price: 18, bulk_price: 17, category_name: "منظفات",
        quantity: 3, min_quantity: 1, loyalty_points: 0, version: 1,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
      }],
      error: null,
    });

    const result = await searchProductsByBarcode("  124  ");

    expect(mockRpc).toHaveBeenCalledOnce();
    expect(mockRpc).toHaveBeenCalledWith("search_products_by_barcode", {
      p_shop_id: "shop-1",
      p_barcode: "124",
    });
    expect(result).toMatchObject({
      total: 1,
      has_more: false,
      next_cursor: null,
      items: [{ id: "p-1", barcodes: ["123", "124"], plu: "PLU-1", costPerUnit: undefined }],
    });
  });

  it("does not call the server for an empty code", async () => {
    await expect(searchProductsByBarcode("  ")).resolves.toMatchObject({ items: [], total: 0, has_more: false });
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
