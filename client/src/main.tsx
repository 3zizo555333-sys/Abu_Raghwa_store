import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { syncPwaInstallability } from "./lib/pwaInstallability";

// Purge obsolete browser-held credentials and plaintext section passwords.
// Business collections are deliberately not touched by this migration cleanup.
try {
  for (const key of [
    "abu_staff_sync_token",
    "abu_staff_cookie_session",
    "abu_raghwa_current_user",
    "abu_raghwa_manager_session",
    "abu_catalog_admin_token",
    "abu_employee_finance_token",
    "abu_raghwa_device_id",
    "manus-cookie",
    "manus-runtime-user-info",
    "abu_raghwa_security_settings",
  ]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
} catch {
  // Storage may be unavailable in a restricted browser; the app never reads
  // these legacy keys as an authentication fallback.
}

// Apply the current route's installability policy before React mounts. Public
// QR pages never advertise an installable app or register a worker for visitors.
syncPwaInstallability(window.location.pathname);

const queryClient = new QueryClient();

// لا نحوّل رفض API إلى انتقال خارجي؛ مصادقة الموظفين تتم عبر Supabase Auth.
const logApiError = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (error.message === UNAUTHED_ERR_MSG) {
    console.warn("[API Auth] رُفض الطلب؛ تحقّق من جلسة الدخول والصلاحيات السحابية.");
  }
};

const isRecoverableCatalogSessionError = (error: unknown) => error instanceof TRPCClientError && error.message === "يلزم تسجيل دخول الإدارة لمتابعة الطلبات";
const isExpectedStaffSyncSessionError = (error: unknown) => error instanceof TRPCClientError && (error.message.includes("سجّل دخول الموظف") || error.message.includes("انتهت جلسة الموظف"));
const isExpectedStaffAccountError = (error: unknown) => error instanceof TRPCClientError && error.message.includes("بيانات الموظف غير صحيحة");
const isTransientNetworkError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|network error|load failed|timeout/i.test(message);
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    logApiError(error);
    if (isRecoverableCatalogSessionError(error) || isExpectedStaffSyncSessionError(error) || isExpectedStaffAccountError(error) || isTransientNetworkError(error)) return;
    console.warn("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    logApiError(error);
    if (isRecoverableCatalogSessionError(error) || isExpectedStaffSyncSessionError(error) || isExpectedStaffAccountError(error) || isTransientNetworkError(error)) return;
    console.warn("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  transformer: superjson,
  links: [
    httpBatchLink({
      url: "/api/trpc",
      // The dashboard mounts many sync queries. Split long GET batches so
      // mobile browsers and proxies never reject one oversized request.
      maxURLLength: 1800,
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
