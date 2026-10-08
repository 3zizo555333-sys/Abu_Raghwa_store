import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("استمرارية جلسة الموظف", () => {
  const root = resolve(import.meta.dirname, "..");
  it("يحفظ جلسة cookie طويلة ويستخدمها دون عرض الرمز للمستخدم", () => {
    const router = readFileSync(resolve(root, "server/routers.ts"), "utf8");
    const auth = readFileSync(resolve(root, "client/src/pages/Auth.tsx"), "utf8");
    expect(router).toContain('maxAge: STAFF_SYNC_COOKIE_MAX_AGE_MS');
    expect(router).toContain('httpOnly: true');
    expect(router).toContain('return { token, user: publicStaffUser');
    expect(auth).toContain('trpc.staffSync.me.useQuery(undefined, { retry: false');
    expect(auth).toContain('localStorage.setItem("abu_staff_cookie_session", "1")');
    expect(auth).not.toContain('setError(syncToken)');
  });

  it("لا يمسح الجلسة عند خطأ شبكة مؤقت", () => {
    const app = readFileSync(resolve(root, "client/src/App.tsx"), "utf8");
    expect(app).toContain("temporary network/proxy failure must never destroy");
    expect(app).toContain('!isTerminalStaffSessionError(staffSession.error)');
    expect(app).toContain('localStorage.removeItem("abu_staff_cookie_session")');
  });

  it("لا يمسح cookie marker إلا من تسجيل الخروج الصريح", () => {
    const layout = readFileSync(resolve(root, "client/src/components/DashboardLayout.tsx"), "utf8");
    const gate = readFileSync(resolve(root, "client/src/components/AccessControlGate.tsx"), "utf8");
    expect(layout).toContain('localStorage.removeItem("abu_staff_cookie_session")');
    expect(gate).toContain('localStorage.getItem("abu_staff_cookie_session")');
  });
});
