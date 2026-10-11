import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvoiceImageFilename, captureInvoicePng, downloadImageBlob, shareInvoicePng } from "./invoiceImage";

const { html2canvasMock } = vi.hoisted(() => ({ html2canvasMock: vi.fn() }));
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  html2canvasMock.mockReset();
});

describe("invoice image export", () => {
  it("captures the invoice element as a non-empty PNG and removes preview scaling in the clone", async () => {
    const png = new Blob(["png-bytes"], { type: "image/png" });
    const canvas = { width: 320, height: 480, toBlob: (callback: BlobCallback) => callback(png) } as HTMLCanvasElement;
    html2canvasMock.mockResolvedValue(canvas);
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
    vi.stubGlobal("window", { devicePixelRatio: 2 });
    const element = { getBoundingClientRect: () => ({ width: 160, height: 240 }) } as HTMLElement;

    await expect(captureInvoicePng(element)).resolves.toBe(png);
    const options = html2canvasMock.mock.calls[0]?.[1];
    expect(options).toMatchObject({ backgroundColor: "#ffffff", scale: 2, useCORS: true, allowTaint: false, logging: false });
    const clone = { querySelector: vi.fn(() => ({ style: { removeProperty: vi.fn() } })) } as unknown as Document;
    options.onclone(clone);
    expect(clone.querySelector).toHaveBeenCalledWith("[data-invoice-export-content]");
  });

  it("surfaces renderer and empty-blob failures instead of pretending to save", async () => {
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    const element = { getBoundingClientRect: () => ({ width: 10, height: 10 }) } as HTMLElement;
    html2canvasMock.mockRejectedValue(new Error("tainted canvas"));
    await expect(captureInvoicePng(element)).rejects.toThrow("tainted canvas");

    html2canvasMock.mockResolvedValue({ width: 1, height: 1, toBlob: (callback: BlobCallback) => callback(null) });
    await expect(captureInvoicePng(element)).rejects.toThrow("تعذر إنشاء ملف PNG");
  });

  it("keeps the object URL alive until the browser has started the PNG download", () => {
    const link = { href: "", download: "", style: {}, click: vi.fn(), remove: vi.fn() };
    const timers: Array<() => void> = [];
    vi.stubGlobal("document", { createElement: vi.fn(() => link), body: { appendChild: vi.fn() } });
    vi.stubGlobal("window", { setTimeout: vi.fn((callback: () => void) => timers.push(callback)) });
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:invoice");
    const revokeUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    downloadImageBlob(new Blob(["png"]), "invoice.png");
    expect(createUrl).toHaveBeenCalledOnce();
    expect(link.download).toBe("invoice.png");
    expect(link.click).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();
    timers[0]?.();
    expect(revokeUrl).toHaveBeenCalledWith("blob:invoice");
  });

  it("shares a PNG file when the browser supports file sharing", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share, canShare: vi.fn(() => true) });
    const fallback = vi.fn();
    const blob = new Blob(["png"], { type: "image/png" });

    await expect(shareInvoicePng(blob, "invoice.png", "فاتورة 1", fallback)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(share.mock.calls[0]?.[0]).toMatchObject({ title: "فاتورة 1", files: [expect.objectContaining({ name: "invoice.png", type: "image/png" })] });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("downloads automatically when file sharing is unsupported or fails", async () => {
    const fallback = vi.fn();
    const blob = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal("navigator", { share: vi.fn(), canShare: vi.fn(() => false) });
    await expect(shareInvoicePng(blob, "invoice.png", "فاتورة", fallback)).resolves.toBe("downloaded");
    expect(fallback).toHaveBeenCalledWith(blob, "invoice.png");

    fallback.mockClear();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new Error("share failed")), canShare: vi.fn(() => true) });
    await expect(shareInvoicePng(blob, "invoice.png", "فاتورة", fallback)).resolves.toBe("downloaded");
    expect(fallback).toHaveBeenCalledWith(blob, "invoice.png");
  });

  it("uses the download fallback when the Web Share API is absent and preserves the user-cancel signal", async () => {
    const fallback = vi.fn();
    const blob = new Blob(["png"], { type: "image/png" });
    vi.stubGlobal("navigator", {});
    await expect(shareInvoicePng(blob, "invoice.png", "فاتورة", fallback)).resolves.toBe("downloaded");
    expect(fallback).toHaveBeenCalledOnce();

    fallback.mockClear();
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")) });
    await expect(shareInvoicePng(blob, "invoice.png", "فاتورة", fallback)).resolves.toBe("cancelled");
    expect(fallback).not.toHaveBeenCalled();
  });

  it("builds safe PNG names", () => {
    expect(buildInvoiceImageFilename("INV 2026/10")).toBe("Invoice-INV-2026-10.png");
  });
});
