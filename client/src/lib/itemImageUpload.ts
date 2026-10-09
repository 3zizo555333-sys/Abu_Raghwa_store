import { prepareCloudProductImage } from "./supabase/prepareProductImage";

const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024;

const readAsDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid image"));
  reader.onerror = () => reject(reader.error || new Error("image read failed"));
  reader.readAsDataURL(blob);
});

const convertToJpeg = (file: File) => new Promise<string>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      const maxEdge = 2048;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    } catch (error) {
      reject(error);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("camera image could not be decoded"));
  };
  image.src = objectUrl;
});

export async function prepareItemImageForUpload(file: File) {
  if (!file) throw new Error("missing image");
  const blob = await prepareCloudProductImage(file);
  const dataUrl = await readAsDataUrl(blob);
  return { dataUrl, fileName: `${file.name?.replace(/\.[^.]+$/, "") || "camera-image"}.webp` };
}

/** Product photos are always converted to WebP before leaving the browser. */
export async function prepareProductImageForUpload(file: File) {
  const blob = await prepareCloudProductImage(file);
  const dataUrl = await readAsDataUrl(blob);
  return {
    blob,
    dataUrl,
    mimeType: "image/webp" as const,
    fileName: `${file.name?.replace(/\.[^.]+$/, "") || "product-image"}.webp`,
  };
}
