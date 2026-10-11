import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertCloudOnline: vi.fn(),
  getSupabaseClient: vi.fn(),
  requireCloudResult: vi.fn((result: any) => {
    if (result?.error) throw new Error(result.error.message);
    if (result?.data == null) throw new Error("Cloud response did not confirm the operation.");
    return result.data;
  }),
  getActiveShopContext: vi.fn(),
  prepareCloudProductImage: vi.fn(),
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  from: vi.fn(),
}));

vi.mock("./client", () => ({
  assertCloudOnline: mocks.assertCloudOnline,
  getSupabaseClient: mocks.getSupabaseClient,
  requireCloudResult: mocks.requireCloudResult,
}));
vi.mock("./products", () => ({ getActiveShopContext: mocks.getActiveShopContext }));
vi.mock("./prepareProductImage", () => ({ prepareCloudProductImage: mocks.prepareCloudProductImage }));

import { uploadPreparedCloudProductImage } from "./productImages";

const shopId = "0d51b750-6e5d-4396-90c3-51d44bf3449b";
const productId = "327bdd68-36cd-48a7-9821-41c9d95e29aa";
const imageId = "74f4b2e3-0d0f-4d9b-a9c1-a5dc1f21fc24";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getActiveShopContext.mockResolvedValue({ shopId, role: "manager", userId: "user-1" });
  mocks.from.mockReturnValue({ upload: mocks.upload, remove: mocks.remove });
  mocks.getSupabaseClient.mockReturnValue({ storage: { from: mocks.from }, rpc: mocks.rpc });
  mocks.upload.mockResolvedValue({ data: { path: "uploaded" }, error: null });
  mocks.remove.mockResolvedValue({ data: [], error: null });
  mocks.rpc.mockResolvedValue({ data: imageId, error: null });
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(imageId);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("product image upload", () => {
  it("uploads to the shop-scoped private bucket then verifies the product-image RPC", async () => {
    const blob = new Blob(["webp-bytes"], { type: "image/webp" });

    await expect(uploadPreparedCloudProductImage({ productId, expectedVersion: 8, blob, mimeType: "image/webp" }))
      .resolves.toEqual({ imageId, storagePath: `${shopId}/products/${productId}/${imageId}.webp` });
    expect(mocks.from).toHaveBeenCalledWith("product-images");
    expect(mocks.upload).toHaveBeenCalledWith(`${shopId}/products/${productId}/${imageId}.webp`, blob, expect.objectContaining({ contentType: "image/webp", upsert: false }));
    expect(mocks.rpc).toHaveBeenCalledWith("register_product_image", expect.objectContaining({
      p_shop_id: shopId,
      p_product_id: productId,
      p_expected_version: 8,
      p_image_id: imageId,
      p_content_type: "image/webp",
      p_size_bytes: blob.size,
    }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("refuses an unauthorized role before creating a Storage object", async () => {
    mocks.getActiveShopContext.mockResolvedValue({ shopId, role: "seller", userId: "user-1" });
    await expect(uploadPreparedCloudProductImage({ productId, expectedVersion: 8, blob: new Blob(["x"]), mimeType: "image/webp" }))
      .rejects.toThrow("رفع صور المنتجات متاح للإدارة فقط");
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("removes an uploaded object if the database does not confirm the product-image link", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "new row violates row-level security policy" } });
    const blob = new Blob(["webp-bytes"], { type: "image/webp" });
    const storagePath = `${shopId}/products/${productId}/${imageId}.webp`;

    await expect(uploadPreparedCloudProductImage({ productId, expectedVersion: 8, blob, mimeType: "image/webp" }))
      .rejects.toThrow("new row violates row-level security policy");
    expect(mocks.remove).toHaveBeenCalledWith([storagePath]);
  });
});
