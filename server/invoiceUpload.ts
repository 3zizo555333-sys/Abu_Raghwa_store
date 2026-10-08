export function parseInvoiceDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } {
  const match = /^data:([^;]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) throw new Error("صيغة صورة الفاتورة غير صالحة");

  const mimeType = match[1];
  if (!mimeType.startsWith("image/")) throw new Error("يسمح برفع الصور فقط");

  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length === 0) throw new Error("ملف الصورة فارغ");
  if (bytes.length > 10 * 1024 * 1024) throw new Error("حجم صورة الفاتورة يجب ألا يتجاوز 10 ميجابايت");
  return { mimeType, bytes };
}

export function safeInvoiceFilename(fileName: string, mimeType: string): string {
  const extension = mimeType.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "jpg";
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[^\w\-]+/g, "_").slice(0, 80) || "invoice";
  return `${stem}.${extension}`;
}
