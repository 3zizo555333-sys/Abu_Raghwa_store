import html2canvas from "html2canvas";

const modernColorFunction = /\b(?:oklch|oklab|lch|lab|color-mix|color)\(/i;
const colorProperties = [
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "text-decoration-color",
  "column-rule-color",
  "caret-color",
  "fill",
  "stroke",
] as const;

/** Resolves browser-supported CSS Color 4 values to legacy rgba() for html2canvas. */
function createLegacyColorResolver(document: Document) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;

  return (color: string): string | null => {
    try {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000000";
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const pixel = context.getImageData(0, 0, 1, 1).data;
      const red = pixel[0];
      const green = pixel[1];
      const blue = pixel[2];
      const alphaByte = pixel[3];
      const alpha = Number((alphaByte / 255).toFixed(3));
      return alpha >= 1
        ? `rgb(${red}, ${green}, ${blue})`
        : `rgba(${red}, ${green}, ${blue}, ${alpha})`;
    } catch {
      return null;
    }
  };
}

function normalizeModernColors(document: Document, root: HTMLElement) {
  const resolveColor = createLegacyColorResolver(document);
  const nodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
  const view = document.defaultView;

  for (const node of nodes) {
    const computed = view?.getComputedStyle(node);
    if (!computed) continue;

    for (const property of colorProperties) {
      const currentColor = computed.getPropertyValue(property).trim();
      if (!modernColorFunction.test(currentColor)) continue;

      const legacyColor = resolveColor?.(currentColor);
      const fallbackColor = property === "color" || property === "fill" || property === "stroke"
        ? "#111827"
        : property === "outline-color"
          ? "transparent"
          : property === "background-color"
            ? "#ffffff"
            : "#e5e7eb";
      node.style.setProperty(property, legacyColor ?? fallbackColor, "important");
    }

    // The app's universal base style uses a theme ring color; receipts do not need outlines.
    node.style.setProperty("outline-color", "transparent", "important");

    const backgroundImage = computed.getPropertyValue("background-image");
    if (modernColorFunction.test(backgroundImage)) {
      // Receipt gradients are provided as explicit hex gradients in the component.
      node.style.setProperty("background-image", "none", "important");
    }
  }
}

/** Captures the visible receipt as a PNG, normalizing any CSS Color 4 values in html2canvas's clone. */
export async function captureInvoicePng(element: HTMLElement): Promise<Blob> {
  if (!element) throw new Error("تعذر العثور على عنصر الفاتورة.");

  try {
    if (typeof document !== "undefined" && document.fonts?.ready) {
      await document.fonts.ready.catch(() => undefined);
    }

    const bounds = element.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      throw new Error("عنصر الفاتورة غير ظاهر أو بلا أبعاد.");
    }

    const scale = typeof window === "undefined"
      ? 2
      : Math.min(3, Math.max(2, window.devicePixelRatio || 1));
    const canvas = await html2canvas(element, {
      backgroundColor: "#ffffff",
      scale,
      useCORS: true,
      allowTaint: false,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      onclone: clonedDocument => {
        const receipt = clonedDocument.querySelector<HTMLElement>("[data-invoice-export-root]");
        const content = clonedDocument.querySelector<HTMLElement>("[data-invoice-export-content]");
        content?.style.removeProperty("transform");
        content?.style.removeProperty("transform-origin");
        if (receipt) normalizeModernColors(clonedDocument, receipt);
      },
    });

    if (canvas.width <= 0 || canvas.height <= 0) {
      throw new Error("التقط المتصفح مساحة صورة فارغة.");
    }
    if (typeof canvas.toBlob !== "function") {
      throw new Error("هذا المتصفح لا يدعم إنشاء ملفات PNG.");
    }

    const blob = await new Promise<Blob | null>((resolve, reject) => {
      try {
        canvas.toBlob(resolve, "image/png");
      } catch (error) {
        reject(error);
      }
    });
    if (!blob || blob.size === 0) {
      throw new Error("تعذر إنشاء ملف PNG من الفاتورة.");
    }
    return blob;
  } catch (error) {
    if (error instanceof Error && /^(تعذر|عنصر الفاتورة|التقط المتصفح|هذا المتصفح)/.test(error.message)) {
      throw error;
    }
    const details = error instanceof Error ? ` ${error.message}` : "";
    throw new Error(`تعذر التقاط صورة الفاتورة.${details}`);
  }
}

/** Builds a safe, portable PNG filename from the invoice identifier. */
export const buildInvoiceImageFilename = (invoiceId?: string) => {
  const safeId = String(invoiceId || "abu-raghwa")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "abu-raghwa";
  return `Invoice-${safeId}.png`;
};

/** Downloads a Blob and keeps its object URL alive long enough for mobile browsers to start. */
export const downloadImageBlob = (blob: Blob, filename: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.style.display = "none";
  try {
    document.body.appendChild(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    link.remove();
    throw error;
  }
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
};

export type InvoiceShareResult = "shared" | "downloaded";

/** Shares the PNG file when supported; any unsupported/failed share automatically downloads it. */
export async function shareInvoicePng(
  blob: Blob,
  filename: string,
  title: string,
  download: (image: Blob, fileName: string) => void = downloadImageBlob,
): Promise<InvoiceShareResult> {
  const fallback = () => {
    download(blob, filename);
    return "downloaded" as const;
  };

  if (!blob || blob.size === 0 || typeof navigator === "undefined" || typeof navigator.share !== "function" || typeof File === "undefined") {
    return fallback();
  }

  let file: File;
  try {
    file = new File([blob], filename, { type: "image/png" });
  } catch {
    return fallback();
  }

  const data: ShareData = { title, files: [file] };
  if (typeof navigator.canShare === "function") {
    try {
      if (!navigator.canShare(data)) return fallback();
    } catch {
      return fallback();
    }
  }

  try {
    await navigator.share(data);
    return "shared";
  } catch {
    // Includes a rejected share sheet: still preserve the requested image by downloading it.
    return fallback();
  }
}

/** Opens an image in a separate tab if a mobile browser prevents direct download. */
export const openImageForManualSave = (blob: Blob) => {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10 * 60 * 1_000);
};
