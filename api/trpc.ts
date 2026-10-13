import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "../server/routers";
import { createFetchContext } from "../server/_core/fetchContext";

const endpoint = "/api/trpc";

function restoreRequestUrl(request: Request): Request {
  const url = new URL(request.url);
  const routedPath = url.searchParams.get("__vercel_path");
  if (routedPath === null) return request;
  url.searchParams.delete("__vercel_path");
  const procedurePath = routedPath.replace(/^\/+/, "");
  url.pathname = procedurePath.startsWith("api/trpc") ? `/${procedurePath}` : `/api/trpc/${procedurePath}`;
  return new Request(url, request);
}

export async function handleTrpcRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-abu-staff-session, x-abu-catalog-session, x-abu-employee-finance-session",
      },
    });
  }
  if (request.method !== "GET" && request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: { Allow: "GET, POST, OPTIONS" } });
  }
  try {
    const routedRequest = restoreRequestUrl(request);
    return await fetchRequestHandler({
      endpoint,
      req: routedRequest,
      router: appRouter,
      createContext: ({ req, resHeaders }) => createFetchContext({ req, resHeaders }),
      onError({ error }) {
        // Do not log request bodies, cookies, authorization values, or session headers.
        console.error("[tRPC Fetch] request failed", error.code);
      },
    });
  } catch {
    return Response.json({ error: "Invalid API request" }, {
      status: 400,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}

export const GET = handleTrpcRequest;
export const POST = handleTrpcRequest;
export const OPTIONS = handleTrpcRequest;
