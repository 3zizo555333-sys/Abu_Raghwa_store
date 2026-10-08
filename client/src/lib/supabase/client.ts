import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let browserClient: SupabaseClient<Database> | undefined;

/**
 * Browser auth is persisted by @supabase/ssr in cookies, not Web Storage.
 * The publishable/anon key is intentionally the only key shipped to the browser.
 */
export function getSupabaseClient(): SupabaseClient<Database> {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("لم يتم إعداد اتصال Supabase. أضف VITE_SUPABASE_URL وVITE_SUPABASE_ANON_KEY ثم أعد تشغيل التطبيق.");
  }
  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseKey, {
      cookieOptions: {
        name: "abu-raghwa-auth",
        path: "/",
        sameSite: "lax",
        secure: typeof window !== "undefined" && window.location.protocol === "https:",
        maxAge: 60 * 60 * 24 * 7,
      },
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    });
  }
  return browserClient;
}

export class CloudUnavailableError extends Error {
  constructor(message = "تعذر الاتصال بالسحابة. لم تُحفظ التغييرات؛ تحقّق من الإنترنت ثم أعد المحاولة.") {
    super(message);
    this.name = "CloudUnavailableError";
  }
}

/** Never queue business writes for replay after reconnect. */
export function assertCloudOnline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new CloudUnavailableError("لا يوجد اتصال بالإنترنت. تم تعطيل الحفظ ولم تُخزّن أي تغييرات محليًا.");
  }
}

export function requireCloudResult<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) {
    if (/failed to fetch|network|connection|offline|fetch failed/i.test(result.error.message)) {
      throw new CloudUnavailableError();
    }
    throw new Error(result.error.message);
  }
  if (result.data === null) throw new CloudUnavailableError("لم يؤكد الخادم حفظ البيانات؛ أعد المحاولة بعد التحقق من الاتصال.");
  return result.data;
}
