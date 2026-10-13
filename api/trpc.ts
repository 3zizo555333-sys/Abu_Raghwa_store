type RuntimeModules = {
  fetchRequestHandler: typeof import("@trpc/server/adapters/fetch").fetchRequestHandler;
  appRouter: typeof import("../server/routers").appRouter;
  createFetchContext: typeof import("../server/_core/fetchContext").createFetchContext;
};

type InitializationPhase = "fetch-adapter" | "app-router" | "fetch-context" | "request-handler";
type RuntimeModuleLoader = (setPhase: (phase: InitializationPhase) => void) => Promise<RuntimeModules>;

const endpoint = "/api/trpc";

async function loadRuntimeModules(setPhase: (phase: InitializationPhase) => void): Promise<RuntimeModules> {
  setPhase("fetch-adapter");
  const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");

  setPhase("app-router");
  const { appRouter } = await import("../server/routers");

  setPhase("fetch-context");
  const { createFetchContext } = await import("../server/_core/fetchContext");

  return { fetchRequestHandler, appRouter, createFetchContext };
}

function restoreRequestUrl(request: Request): Request {
  const url = new URL(request.url);
  const routedPath = url.searchParams.get("__vercel_path");
  if (routedPath === null) return request;
  url.searchParams.delete("__vercel_path");
  const procedurePath = routedPath.replace(/^\/+/, "");
  url.pathname = procedurePath.startsWith("api/trpc") ? `/${procedurePath}` : `/api/trpc/${procedurePath}`;
  return new Request(url, request);
}

function safeErrorName(error: unknown): string {
  if (!(error instanceof Error)) return "UnknownError";
  return /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : "UnknownError";
}

export async function handleTrpcRequest(
  request: Request,
  moduleLoader: RuntimeModuleLoader = loadRuntimeModules,
): Promise<Response> {
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

  let phase: InitializationPhase = "fetch-adapter";
  try {
    const modules = await moduleLoader(nextPhase => { phase = nextPhase; });
    phase = "request-handler";
    const routedRequest = restoreRequestUrl(request);
    return await modules.fetchRequestHandler({
      endpoint,
      req: routedRequest,
      router: modules.appRouter,
      createContext: ({ req, resHeaders }) => modules.createFetchContext({ req, resHeaders }),
      onError({ error }) {
        // Do not log request bodies, cookies, authorization values, or session headers.
        console.error("[tRPC Fetch] request failed", error.code);
      },
    });
  } catch (error) {
    // Public response is intentionally sanitized: never expose an exception
    // message, filesystem path, environment value, or stack trace to callers.
    return Response.json({
      error: "API_TEMPORARILY_UNAVAILABLE",
      phase,
      name: safeErrorName(error),
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}

export const GET = handleTrpcRequest;
export const POST = handleTrpcRequest;
export const OPTIONS = handleTrpcRequest;
