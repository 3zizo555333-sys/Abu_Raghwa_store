import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import "./index.css";
import { syncPwaInstallability } from "./lib/pwaInstallability";

// Apply the current route's installability policy before React mounts. Public
// QR pages never advertise an installable app or register a worker for visitors.
syncPwaInstallability(window.location.pathname);

const queryClient = new QueryClient();

// تطبيق أبو رغوة يستخدم دخول الموظفين المحلي عبر /auth، وليس OAuth التلقائي.
// لا نحوّل رفض استعلامات المزامنة إلى انتقال خارجي؛ لأن ذلك قد يعلق أجهزة العمال.
const logApiError = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (error.message === UNAUTHED_ERR_MSG) {
    console.warn("[Local Auth] تم رفض طلب API؛ سيستمر التطبيق بدخول الموظف المحلي.");
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
      headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        const headers: Record<string, string> = {};
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
          }
          const catalogToken = sessionStorage.getItem("abu_catalog_admin_token");
          if (catalogToken) headers["x-abu-catalog-session"] = catalogToken;
          const employeeFinanceToken = sessionStorage.getItem("abu_employee_finance_token");
          if (employeeFinanceToken) headers["x-abu-employee-finance-session"] = employeeFinanceToken;
          const staffSyncToken = sessionStorage.getItem("abu_staff_sync_token") || localStorage.getItem("abu_staff_sync_token");
          if (staffSyncToken) headers["x-abu-staff-session"] = staffSyncToken;
        } catch {
          // sessionStorage unavailable
        }
        return headers;
      },
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
