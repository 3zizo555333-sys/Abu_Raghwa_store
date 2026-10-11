import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import html2canvas from "html2canvas";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvoiceImageFilename, captureInvoicePng, shareInvoicePng } from "../client/src/lib/invoiceImage";

vi.mock("html2canvas", () => ({ default: vi.fn() }));

const root = resolve(import.meta.dirname, "..");
const html2canvasMock = vi.mocked(html2canvas);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("صورة الفاتورة", () => {
  it("ينشئ ملف PNG صالحاً من رقم الفاتورة", () => {
    expect(buildInvoiceImageFilename("INV-12345")).toBe("Invoice-INV-12345.png");
  });

  it("يتعامل مع رقم فاتورة فارغ باسم افتراضي صالح", () => {
    expect(buildInvoiceImageFilename()).toBe("Invoice-abu-raghwa.png");
  });

  it("ينزّل PNG تلقائياً عندما لا يدعم المتصفح مشاركة الملفات", async () => {
    vi.stubGlobal("navigator", {});
    const download = vi.fn();
    const image = new Blob(["png"], { type: "image/png" });

    await expect(shareInvoicePng(image, "invoice.png", "فاتورة", download)).resolves.toBe("downloaded");
    expect(download).toHaveBeenCalledWith(image, "invoice.png");
  });

  it("ينزّل PNG تلقائياً عند فشل navigator.share", async () => {
    class TestFile {
      constructor(public parts: BlobPart[], public name: string, public options: FilePropertyBag) {}
    }
    const share = vi.fn().mockRejectedValue(new Error("share failed"));
    vi.stubGlobal("File", TestFile);
    vi.stubGlobal("navigator", { canShare: () => true, share });
    const download = vi.fn();
    const image = new Blob(["png"], { type: "image/png" });

    await expect(shareInvoicePng(image, "invoice.png", "فاتورة", download)).resolves.toBe("downloaded");
    expect(share).toHaveBeenCalledOnce();
    expect(download).toHaveBeenCalledWith(image, "invoice.png");
  });

  it("يحوّل لون oklch في clone إلى RGB قبل استدعاء html2canvas", async () => {
    const styleValues = new Map<string, string>();
    const makeStyle = () => ({
      setProperty: vi.fn((property: string, value: string) => styleValues.set(property, value)),
      removeProperty: vi.fn((property: string) => styleValues.delete(property)),
    });
    const child = { style: makeStyle() } as unknown as HTMLElement;
    const receipt = {
      style: makeStyle(),
      querySelectorAll: () => [child],
    } as unknown as HTMLElement;
    const content = { style: makeStyle() } as unknown as HTMLElement;
    const context = {
      fillStyle: "#000000",
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) })),
    } as unknown as CanvasRenderingContext2D;
    const clonedDocument = {
      createElement: () => ({ getContext: () => context }),
      defaultView: {
        getComputedStyle: () => ({
          getPropertyValue: (property: string) => property === "color"
            ? "oklch(0.6 0.2 30)"
            : property === "background-image"
              ? "linear-gradient(to right, oklch(0.6 0.2 30), #ffffff)"
              : "rgb(0, 0, 0)",
        }),
      },
      querySelector: (selector: string) => selector.includes("content") ? content : receipt,
    } as unknown as Document;
    const canvas = {
      width: 1,
      height: 1,
      toBlob: (callback: BlobCallback) => callback(new Blob(["png"], { type: "image/png" })),
    } as unknown as HTMLCanvasElement;
    html2canvasMock.mockImplementation(async (_element, options) => {
      options?.onclone?.(clonedDocument);
      return canvas;
    });
    const element = { getBoundingClientRect: () => ({ width: 200, height: 400 }) } as unknown as HTMLElement;

    const image = await captureInvoicePng(element);

    expect(image.type).toBe("image/png");
    expect(styleValues.get("color")).toBe("rgb(12, 34, 56)");
    expect(styleValues.get("outline-color")).toBe("transparent");
    expect(styleValues.get("background-image")).toBe("none");
  });

  it("يستخدم ألوان Hex صريحة في قالب الالتقاط ويحوّل أي لون CSS حديث قبل الرسم", () => {
    const invoice = readFileSync(resolve(root, "client/src/pages/Invoice.tsx"), "utf8");
    const capture = readFileSync(resolve(root, "client/src/lib/invoiceImage.ts"), "utf8");
    const receipt = invoice.slice(invoice.indexOf("data-invoice-export-root"), invoice.indexOf("</article>"));

    expect(invoice).toContain("captureInvoicePng(invoiceRef.current)");
    expect(invoice).toContain('paper: "#ffffff"');
    expect(receipt).toContain("linear-gradient(to bottom");
    expect(receipt).not.toMatch(/\b(?:bg|text|border)-(?:orange|gray|slate|white|black)-(?:50|100|200|300|400|500|600|700|800|900)(?:\/\d+)?\b/);
    expect(capture).toContain("normalizeModernColors(clonedDocument, receipt)");
  });
});
