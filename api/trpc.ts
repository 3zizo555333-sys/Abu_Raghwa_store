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

function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown error";
  return error.message
    .replace(/\b(Bearer\s+)[^\s,;]+/gi, "$1[redacted]")
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*\b/g, "[redacted-jwt]")
    .replace(/\b((?:JWT_SECRET|DATABASE_URL|OAUTH_SERVER_URL|BUILT_IN_FORGE_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY))\s*[:=]\s*[^,\s;]+/gi, "$1=[redacted]")
    .replace(/\b(password|secret|token|api[-_]?key)\s*[:=]\s*[^,\s;]+/gi, "$1=[redacted]")
    .replace(/(?:file:\/\/)?\/(?:[^\s"'():]+\/)*[^\s"'():]+/g, "[path]")
    .replace(/https?:\/\/[^\s"'<>]+/g, "[url]")
    .slice(0, 240) || "No error message";
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
      message: phase === "request-handler" ? "Request processing failed" : safeErrorMessage(error),
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }
}

function vercelHandler(request: Request): Promise<Response> {
  // Vercel may supply a second platform argument to function exports. Keep the
  // exported HTTP handlers one-argument wrappers so it cannot be mistaken for
  // the internal test-only module loader accepted by handleTrpcRequest.
  return handleTrpcRequest(request);
}

export const GET = vercelHandler;
export const POST = vercelHandler;
export const OPTIONS = vercelHandler;
