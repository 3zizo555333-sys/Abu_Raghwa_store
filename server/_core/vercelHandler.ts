import type { Request, Response } from "express";

type ApiApplication = import("express").Express;
let app: ApiApplication | undefined;

export function normalizeVercelStoragePath(url: string): string {
  return url.replace(/^\/api\/manus-storage(?=\/|$|\?)/, "/manus-storage");
}

/** Restore a path captured by a Vercel custom route and passed to the static API gateway. */
export function restoreVercelRoutedPath(url: string): string {
  const parsed = new URL(url, "http://vercel.internal");
  const routedPath = parsed.searchParams.get("__vercel_path");
  if (routedPath === null) return normalizeVercelStoragePath(url);

  parsed.searchParams.delete("__vercel_path");
  const relativePath = routedPath.replace(/^\/+/, "");
  const requestPath = relativePath === "manus-storage" || relativePath.startsWith("manus-storage/")
    ? `/${relativePath}`
    : `/api/${relativePath}`;
  const query = parsed.searchParams.toString();
  return `${requestPath}${query ? `?${query}` : ""}`;
}

function waitForResponse(response: Response): Promise<void> {
  return new Promise(resolve => {
    if (response.writableEnded) {
      resolve();
      return;
    }
    const complete = () => {
      response.off("finish", complete);
      response.off("close", complete);
      resolve();
    };
    response.once("finish", complete);
    response.once("close", complete);
  });
}

/** Reuse the Express app in warm function instances; do not open a listening socket. */
export default async function vercelHandler(req: Request, res: Response): Promise<void> {
  try {
    req.url = normalizeVercelStoragePath(req.url ?? "/");
    if (!app) {
      const { createApiApp } = await import("./app");
      app = createApiApp();
    }

    const responseComplete = waitForResponse(res);
    app(req, res);
    await responseComplete;
  } catch (error) {
    console.error("[Vercel API] request handler failed", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: "API temporarily unavailable" }));
    }
  }
}
