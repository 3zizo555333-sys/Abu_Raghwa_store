import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerStorageProxy } from "./storageProxy";

/** Build the stateless API application without opening a listening socket. */
export function createApiApp(): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  // Business images upload directly to Supabase Storage. Keep the larger JSON
  // limit for legacy RPCs during the staged migration; Vercel still applies its
  // platform request-size limit before this middleware is reached.
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    next();
  });

  registerStorageProxy(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
