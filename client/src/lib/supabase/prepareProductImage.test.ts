import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareCloudProductImage } from "./prepareProductImage";

describe("prepareCloudProductImage", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("retries Canvas WebP compression until the output is strictly below 300 KB", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2400, height: 1600, close }));
    let renders = 0;
    class FakeOffscreenCanvas {
      constructor(_width: number, _height: number) {}
      getContext() {
        return { drawImage: vi.fn() } as unknown as OffscreenCanvasRenderingContext2D;
      }
      async convertToBlob() {
        renders += 1;
        const byteCount = renders === 1 ? 300_000 : 299_999;
        return new Blob([new Uint8Array(byteCount)], { type: "image/webp" });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const file = new File([new Uint8Array([1])], "formulation.webp", { type: "image/webp" });
    const result = await prepareCloudProductImage(file);

    expect(renders).toBe(2);
    expect(result.type).toBe("image/webp");
    expect(result.size).toBe(299_999);
    expect(result.size).toBeLessThan(300_000);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
