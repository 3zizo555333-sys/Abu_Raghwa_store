import type { ProgressInfo } from "@bunnio/rembg-web";

type RembgApi = typeof import("@bunnio/rembg-web");
let cachedSession: ReturnType<RembgApi["newSession"]> | null = null;

export async function removeProductBackground(
  file: File,
  onProgress?: (progress: ProgressInfo) => void,
): Promise<Blob> {
  const ort = await import("onnxruntime-web");
  // Vite emits ONNX's WASM assets with hashed URLs; keep its bundled resolver intact.
  ort.env.wasm.numThreads = 1;
  const rembg = await import("@bunnio/rembg-web");
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const modelUrl = new URL("models/u2netp.onnx", baseUrl).toString();
  rembg.rembgConfig.setCustomModelPath("u2netp", modelUrl);
  const sessionPromise = cachedSession || rembg.newSession("u2netp");
  cachedSession = sessionPromise;
  try {
    return await rembg.remove(file, {
      session: await sessionPromise,
      postProcessMask: true,
      onProgress,
    });
  } catch (error) {
    if (cachedSession === sessionPromise) cachedSession = null;
    throw error;
  }
}
