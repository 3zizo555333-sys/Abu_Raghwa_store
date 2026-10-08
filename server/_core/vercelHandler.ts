import type { Request, Response } from "express";
import { createApiApp } from "./app";

// Reuse one Express application per warm Function instance; never open a port.
const app = createApiApp();

export function normalizeVercelStoragePath(url: string): string {
  return url.replace(/^\/api\/manus-storage(?=\/|$|\?)/, "/manus-storage");
}

export default function vercelHandler(req: Request, res: Response): void {
  // Vercel routes legacy /manus-storage requests through the /api Function
  // namespace. Restore the path expected by the storage proxy middleware.
  req.url = normalizeVercelStoragePath(req.url ?? "/");
  app(req, res);
}
