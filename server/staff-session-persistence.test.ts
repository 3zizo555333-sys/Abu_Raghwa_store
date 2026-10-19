import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("استمرارية جلسة الموظف", () => {
  const root = resolve(import.meta.dirname, "..");
  it("يسجل الدخول عبر Supabase Auth ويستعيد العضوية من الجلسة الدائمة", () => {
    const authPage = readFileSync(resolve(root, "client/src/pages/Auth.tsx"), "utf8");
    const auth = readFileSync(resolve(root, "client/src/lib/supabase/auth.ts"), "utf8");
    const client = readFileSync(resolve(root, "client/src/lib/supabase/client.ts"), "utf8");
    const staffHook = readFileSync(resolve(root, "client/src/hooks/useStaffAccess.ts"), "utf8");
    expect(authPage).toContain("supabase.auth.signInWithPassword");
    expect(authPage).toContain("loadCurrentStaffSession()");
    expect(auth).toContain("supabase.auth.getUser()");
    expect(auth).toContain('.from("shop_memberships")');
    expect(client).toContain("createBrowserClient");
    expect(client).toContain("persistSession: true");
    expect(client).toContain("autoRefreshToken: true");
    expect(client).toContain("detectSessionInUrl: true");
    expect(client).toContain("window.localStorage");
    expect(staffHook).toContain("loadCurrentStaffSession");
  });

  it("لا يخزن رموز جلسة قديمة أو بيانات موظف خارج Supabase Auth", () => {
    const files = [
      "client/src/pages/Auth.tsx",
      "client/src/lib/supabase/auth.ts",
      "client/src/lib/supabase/client.ts",
      "client/src/hooks/useStaffAccess.ts",
      "client/src/_core/hooks/useAuth.ts",
    ];
    const authSources = files.map(path => readFileSync(resolve(root, path), "utf8")).join("\n");
    expect(authSources).not.toContain("abu_staff_sync_token");
    expect(authSources).not.toContain("staffSync");
  });

  it("يعيد التحقق من الجلسة عند تغير حالة Supabase ويستخدم Auth عند تسجيل الخروج", () => {
    const staffHook = readFileSync(resolve(root, "client/src/hooks/useStaffAccess.ts"), "utf8");
    const authHook = readFileSync(resolve(root, "client/src/_core/hooks/useAuth.ts"), "utf8");
    const gate = readFileSync(resolve(root, "client/src/components/AccessControlGate.tsx"), "utf8");
    expect(staffHook).toContain("retry: false");
    expect(staffHook).toContain("supabase.auth.onAuthStateChange");
    expect(staffHook).toContain("invalidateQueries({ queryKey: CURRENT_STAFF_QUERY_KEY })");
    expect(authHook).toContain('getSupabaseClient().auth.signOut({ scope: "local" })');
    expect(gate).toContain("useStaffAccess()");
    expect(gate).toContain("isUserAllowed(user)");
  });
});
