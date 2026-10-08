import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildEmployeeFinanceSummary, getMonthKey, hashEmployeeFinancePin } from "./employeeFinance";
import { appRouter } from "./routers";
import * as db from "./db";

const caller = (headers: Record<string, string> = {}) => appRouter.createCaller({ req: { headers }, res: {} } as any);
const activeAssignment = { employeeId: "e1", pinHash: hashEmployeeFinancePin("4321"), isActive: true, createdAt: "2026-08-01", updatedAt: "2026-08-01" };
const employeeStore = (isActive = true) => ({ profiles: [{ id: "e1", name: "عامل", salary: 3000 }], assignments: [{ ...activeAssignment, isActive }], withdrawals: [], managerWithdrawals: [] });

describe("حسابات الموظفين وسلامة بطاقة العامل", () => {
  let staffAccounts: any[] = [];

  beforeEach(() => {
    staffAccounts = [];
    vi.spyOn(db, "getStaffAccounts").mockImplementation(async () => staffAccounts as any);
    vi.spyOn(db, "importStaffAccounts").mockImplementation(async accounts => { staffAccounts = [...accounts] as any; });
    vi.spyOn(db, "updateStaffAccount").mockImplementation(async (email, changes) => { staffAccounts = staffAccounts.map(account => account.email === email ? { ...account, ...changes } : account); });
    vi.spyOn(db, "deleteStaffAccount").mockImplementation(async email => { staffAccounts = staffAccounts.filter(account => account.email !== email); });
  });

  afterEach(async () => {
    await db.deleteStaffAccount("finance-stop-manager@example.com").catch(() => undefined);
    await db.deleteStaffAccount("finance-private-manager@example.com").catch(() => undefined);
    vi.restoreAllMocks();
  });

  it("يحسب المستحق والسحوبات حسب أيام العمل", () => {
    const summary = buildEmployeeFinanceSummary({ id: "e1", name: "عامل", salary: 3000 }, [{ employeeId: "e1", date: "2026-08-01", status: "present" }, { employeeId: "e1", date: "2026-08-02", status: "present" }], [{ id: "w1", employeeId: "e1", amount: 50, description: "مصاريف", requestedAt: "2026-08-03T10:00:00.000Z", requestedByEmail: "card", status: "approved" }, { id: "w2", employeeId: "e1", amount: 25, description: "طلب", requestedAt: "2026-08-03T11:00:00.000Z", requestedByEmail: "card", status: "pending" }], new Date("2026-08-20T10:00:00.000Z"));
    expect(summary).toMatchObject({ workedDays: 2, dailyRate: 100, earnedAmount: 200, registeredWithdrawals: 75, remainingAmount: 125 });
    expect(getMonthKey("٢٠/٠٨/٢٠٢٦")).toBe("2026-08");
  });

  it("يفتح العامل بطاقته بكلمة مرور المدير فقط، بلا بريد إلكتروني", async () => {
    vi.spyOn(db, "getGlobalAppSetting").mockImplementation(async key => key === "abu_raghwa_employee_finance" ? { key, dataJson: JSON.stringify(employeeStore()), updatedAt: new Date() } as any : null);
    const login = await caller().employeeFinance.login({ cardPassword: "4321" });
    expect(login.access).toBe("employee");
    await expect(caller({ "x-abu-employee-finance-session": login.token }).employeeFinance.managerOverview()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يرفض البطاقة عند كلمة مرور خاطئة أو عند إيقافها", async () => {
    vi.spyOn(db, "getGlobalAppSetting").mockImplementation(async key => key === "abu_raghwa_employee_finance" ? { key, dataJson: JSON.stringify(employeeStore(false)), updatedAt: new Date() } as any : null);
    await expect(caller().employeeFinance.login({ cardPassword: "4321" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("يسمح للعامل بسحبة معلقة من بطاقته النشطة فقط", async () => {
    const save = vi.spyOn(db, "setGlobalAppSetting").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockImplementation(async key => key === "abu_raghwa_employee_finance" ? { key, dataJson: JSON.stringify(employeeStore()), updatedAt: new Date() } as any : null);
    const login = await caller().employeeFinance.login({ cardPassword: "4321" });
    await expect(caller({ "x-abu-employee-finance-session": login.token }).employeeFinance.requestWithdrawal({ amount: 75, description: "مواصلات" })).resolves.toMatchObject({ success: true, withdrawal: { employeeId: "e1", status: "pending" } });
    expect(save).toHaveBeenCalledWith("abu_raghwa_employee_finance", expect.stringContaining('"status":"pending"'));
  });

  it("يوقف المدير بطاقة العامل فتُلغى قدرتها على الدخول", async () => {
    const manager = { email: "finance-stop-manager@example.com", password: "manager-pass", role: "manager", isApproved: true, isBlocked: false };
    const save = vi.spyOn(db, "setGlobalAppSetting").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockImplementation(async key => {
      if (key === "abu_raghwa_users") return { key, dataJson: JSON.stringify([manager]), updatedAt: new Date() } as any;
      if (key === "abu_raghwa_employee_finance") return { key, dataJson: JSON.stringify(employeeStore()), updatedAt: new Date() } as any;
      return null;
    });
    const managerLogin = await caller().employeeFinance.login({ email: manager.email, password: manager.password });
    await expect(caller({ "x-abu-employee-finance-session": managerLogin.token }).employeeFinance.setEmployeeCardAccess({ employeeId: "e1", isActive: false })).resolves.toEqual({ success: true, isActive: false });
    expect(save).toHaveBeenCalledWith("abu_raghwa_employee_finance", expect.stringContaining('"isActive":false'));
  });

  it("لا يسمح بالمزامنة العامة لسجل بطاقات العمال الخاص", async () => {
    await expect(caller().sync.get({ key: "abu_raghwa_employee_finance" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller().sync.set({ key: "abu_raghwa_employee_finance", dataJson: "{}" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("يحمي الأقسام الخاصة ويتيح الكتالوج العام فقط", async () => {
    const manager = { email: "finance-private-manager@example.com", password: "manager-pass", role: "manager", isApproved: true, isBlocked: false };
    const save = vi.spyOn(db, "setGlobalAppSetting").mockResolvedValue(undefined);
    vi.spyOn(db, "getGlobalAppSetting").mockImplementation(async key => key === "abu_raghwa_users" ? { key, dataJson: JSON.stringify([manager]), updatedAt: new Date() } as any : { key, dataJson: "[]", updatedAt: new Date() } as any);
    await expect(caller().sync.get({ key: "abu_raghwa_tasks" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller().sync.set({ key: "abu_raghwa_tasks", dataJson: "[]" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller().sync.get({ key: "abu_raghwa_products" })).resolves.toBe("[]");
    const login = await caller().staffSync.login({ email: manager.email, password: manager.password });
    await expect(caller({ "x-abu-staff-session": login.token }).sync.set({ key: "abu_raghwa_tasks", dataJson: "[]" })).resolves.toEqual({ success: true });
    expect(save).toHaveBeenCalledWith("abu_raghwa_tasks", "[]");
  });
});
