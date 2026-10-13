import type { Request, Response } from "express";
import handler, { restoreVercelRoutedPath } from "../server/_core/vercelHandler";

export default function vercelApiGateway(req: Request, res: Response): Promise<void> {
  req.url = restoreVercelRoutedPath(req.url ?? "/");
  return handler(req, res);
}
