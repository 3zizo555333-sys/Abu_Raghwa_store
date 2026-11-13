import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createApiApp } from "./app";
import { restoreVercelRoutedPath } from "./vercelHandler";

// Bundled as a single server runtime for Vercel so local ESM imports are
// resolved at build time rather than left as extensionless runtime imports.
const api = express();
api.disable("x-powered-by");
api.use((req, res, next) => {
  try {
    req.url = restoreVercelRoutedPath(req.url ?? "/");
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    next();
  } catch {
    res.status(400).json({ error: "Invalid API request" });
  }
});
api.all("/catalog/upload-media", async (req, res, next) => {
  try {
    const { catalogMediaUploadRoute } = await import("../catalogMediaUpload");
    return catalogMediaUploadRoute(req, res);
  } catch (error) {
    return next(error);
  }
});
api.all("/api/telegram-archive/:action", express.json({ limit: "3mb" }), async (req, res, next) => {
  try {
    const { telegramArchiveApi } = await import("../services/telegramArchive");
    return telegramArchiveApi(req, res);
  } catch (error) {
    return next(error);
  }
});
api.all("/api/cron/daily-backup", async (req, res, next) => {
  try {
    const { dailyBackupApi } = await import("../services/telegramArchive");
    return dailyBackupApi(req, res);
  } catch (error) {
    return next(error);
  }
});
api.use(createApiApp());
api.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});
api.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(
    "[Vercel API] unhandled request error",
    error instanceof Error ? error.name : "UnknownError",
  );
  if (!res.headersSent) {
    res.status(500).json({ error: "API temporarily unavailable" });
  }
});

export default api;
