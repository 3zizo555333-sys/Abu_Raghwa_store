const SUPPORTED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
const DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024;

const readAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("invalid image"));
  reader.onerror = () => reject(reader.error || new Error("image read failed"));
  reader.readAsDataURL(file);
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
  if (file.size > 16 * 1024 * 1024) throw new Error("image too large");

  const dataUrl = await readAsDataUrl(file);
  const detectedMime = /^data:([^;]+);base64,/i.exec(dataUrl)?.[1]?.toLowerCase() || "";
  const needsConversion = !SUPPORTED_MIME_TYPES.includes(detectedMime) || file.size > DIRECT_UPLOAD_BYTES;
  const normalizedDataUrl = needsConversion ? await convertToJpeg(file) : dataUrl;
  const mimeType = /^data:([^;]+);base64,/i.exec(normalizedDataUrl)?.[1]?.toLowerCase() || "";

  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) throw new Error("unsupported image type");
  const base64Length = normalizedDataUrl.length - normalizedDataUrl.indexOf(",") - 1;
  const bytes = Math.floor((base64Length * 3) / 4);
  if (bytes > MAX_UPLOAD_BYTES) throw new Error("image too large after conversion");

  const safeName = `${file.name?.replace(/\.[^.]+$/, "") || "camera-image"}.${mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg"}`;
  return { dataUrl: normalizedDataUrl, fileName: safeName };
}

const convertToJpegBlob = (file: File) => new Promise<Blob>((resolve, reject) => {
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    try {
      const maxEdge = 1280;
      const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round((image.naturalWidth || 1) * scale));
      canvas.height = Math.max(1, Math.round((image.naturalHeight || 1) * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas unavailable");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("image conversion failed")), "image/jpeg", 0.78);
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

/** Fast product path: keeps small supported images as bytes and resizes large photos before upload. */
export async function prepareProductImageForUpload(file: File) {
  if (!file) throw new Error("missing image");
  if (file.size > 16 * 1024 * 1024) throw new Error("image too large");
  const detectedMime = file.type.toLowerCase();
  const direct = SUPPORTED_MIME_TYPES.includes(detectedMime) && file.size <= DIRECT_UPLOAD_BYTES;
  const blob = direct ? file.slice(0, file.size, detectedMime) : await convertToJpegBlob(file);
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("image too large after conversion");
  const mimeType = direct ? detectedMime as "image/jpeg" | "image/png" | "image/webp" : "image/jpeg";
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const dataUrl = await readAsDataUrl(blob as File);
  return { blob, dataUrl, mimeType, fileName: `${file.name?.replace(/\.[^.]+$/, "") || "product-image"}.${extension}` };
}
