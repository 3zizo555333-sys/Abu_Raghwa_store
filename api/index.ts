import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createApiApp } from "../server/_core/app";
import { restoreVercelRoutedPath } from "../server/_core/vercelHandler";

// Vercel's Express integration expects the Express application itself as the
// default export. This also avoids depending on a hand-written Node adapter
// whose lifecycle differs between local Node and Vercel Functions.
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
    const { catalogMediaUploadRoute } = await import("../server/catalogMediaUpload");
    return catalogMediaUploadRoute(req, res);
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
