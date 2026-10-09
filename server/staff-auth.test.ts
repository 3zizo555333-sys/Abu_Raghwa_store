import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter, isActiveStaffAccount, normalizeStoredAccessUsers, resetStaffAccountMigrationForTests } from "./routers";
import * as db from "./db";

type Account = {
  id: string;
  email: string;
  passwordHash: string;
  role: "manager" | "admin" | "seller";
  status: "PENDING_APPROVAL" | "APPROVED";
  isBlocked: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
};

const caller = (headers: Record<string, string> = {}) => appRouter.createCaller({ req: { headers }, res: { cookie: vi.fn() } } as any);

const account = (input: Partial<Account> & Pick<Account, "email" | "passwordHash" | "role" | "status">): Account => ({
  id: input.id || `user_${input.email}`,
  email: input.email,
  passwordHash: input.passwordHash,
  role: input.role,
  status: input.status,
  isBlocked: input.isBlocked || 0,
  createdAt: input.createdAt || new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: input.updatedAt || new Date("2026-01-01T00:00:00.000Z"),
  lastLoginAt: input.lastLoginAt ?? null,
});

let accounts: Account[] = [];

function mockAccountStore() {
  vi.spyOn(db, "getStaffAccounts").mockImplementation(async () => accounts as any);
  vi.spyOn(db, "insertStaffAccount").mockImplementation(async value => {
    if (accounts.some(item => item.email === value.email)) {
      const error = Object.assign(new Error("duplicate"), { code: "ER_DUP_ENTRY" });
      throw error;
    }
    accounts.push(account(value as any));
  });
  vi.spyOn(db, "updateStaffAccount").mockImplementation(async (email, changes) => {
    const item = accounts.find(candidate => candidate.email === email);
    if (item) Object.assign(item, changes, { updatedAt: new Date() });
  });
  vi.spyOn(db, "deleteStaffAccount").mockImplementation(async email => {
    accounts = accounts.filter(item => item.email !== email);
  });
  vi.spyOn(db, "getGlobalAppSetting").mockResolvedValue(null);
  vi.spyOn(db, "importStaffAccounts").mockImplementation(async imported => {
    accounts.push(...(imported as any[]).map(value => account(value as any)));
  });
}

afterEach(() => {
  accounts = [];
  resetStaffAccountMigrationForTests();
  vi.restoreAllMocks();
});

describe("staff account state", () => {
  it("normalizes emails and fills a pending state for newly registered users", () => {
    const users = normalizeStoredAccessUsers([
      { email: "  New.User@Example.com ", password: "secret123", role: "seller" },
    ]);

    expect(users).toEqual([
      expect.objectContaining({
        email: "new.user@example.com",
        password: "secret123",
        role: "seller",
        status: "PENDING_APPROVAL",
        isApproved: false,
        isBlocked: false,
      }),
    ]);
    expect(isActiveStaffAccount(users[0]!)).toBe(false);
  });

  it("allows an approved account and rejects blocked accounts", () => {
    const [approved, blocked, manager] = normalizeStoredAccessUsers([
      { email: "approved@example.com", password: "secret123", role: "seller", status: "ACTIVE", isApproved: true },
      { email: "blocked@example.com", password: "secret123", role: "seller", status: "ACTIVE", isApproved: true, isBlocked: true },
      { email: "manager@example.com", password: "secret123", role: "manager", status: "ACTIVE" },
    ]);

    expect(isActiveStaffAccount(approved!)).toBe(true);
    expect(isActiveStaffAccount(blocked!)).toBe(false);
    expect(isActiveStaffAccount(manager!)).toBe(true);
  });

  it("treats lowercase lifecycle values consistently and keeps one canonical email", () => {
    const users = normalizeStoredAccessUsers([
      { email: "employee@example.com", password: "old-pass", role: "seller", status: "pending" },
      { email: " EMPLOYEE@example.com ", password: "new-pass", role: "seller", status: "approved" },
    ]);

    expect(users).toHaveLength(1);
    expect(users[0]).toEqual(expect.objectContaining({
      email: "employee@example.com",
      password: "new-pass",
      status: "APPROVED",
      isApproved: true,
    }));
    expect(isActiveStaffAccount(users[0]!)).toBe(true);
  });

  it("creates the first account as a manager and allows immediate login", async () => {
    mockAccountStore();

    const registration = await caller().staffSync.register({ email: "fresh.manager@example.com", password: "secret123" });
    expect(registration).toMatchObject({ success: true, pending: false, user: { role: "manager", isApproved: true, status: "APPROVED" } });
    expect(accounts[0]?.passwordHash).toMatch(/^scrypt\$/);

    const login = await caller().staffSync.login({ email: "fresh.manager@example.com", password: "secret123" });
    expect(login.user).toMatchObject({ email: "fresh.manager@example.com", role: "manager", isApproved: true });
    expect(login.token).toEqual(expect.any(String));
  });

  it("recovers manager access when only an orphaned pending account remains", async () => {
    mockAccountStore();
    await caller().staffSync.register({ email: "orphan@example.com", password: "secret123" });
    accounts[0]!.role = "seller";
    accounts[0]!.status = "PENDING_APPROVAL";

    const recovered = await caller().staffSync.register({ email: "orphan@example.com", password: "secret123" });
    expect(recovered).toMatchObject({ success: true, existing: true, pending: false, bootstrapRecovered: true, user: { role: "manager", isApproved: true } });

    const login = await caller().staffSync.login({ email: "orphan@example.com", password: "secret123" });
    expect(login.user).toMatchObject({ role: "manager", isApproved: true });
  });

  it("ignores malformed records instead of making them login candidates", () => {
    expect(normalizeStoredAccessUsers([
      null,
      { email: "missing-password@example.com", role: "seller" },
      { password: "missing-email", role: "seller" },
      { email: "valid@example.com", password: "secret123", role: "seller", isApproved: true },
    ])).toHaveLength(1);
  });

  it("uses the server record for approval, role changes, blocking, and deletion", async () => {
    mockAccountStore();
    const first = await caller().staffSync.register({ email: "manager@example.com", password: "manager-pass" });
    const managerLogin = await caller().staffSync.login({ email: "manager@example.com", password: "manager-pass" });
    expect(first.user.role).toBe("manager");

    const worker = await caller().staffSync.register({ email: "worker@example.com", password: "worker-pass" });
    expect(worker.user).toMatchObject({ status: "PENDING_APPROVAL", isApproved: false });
    const managerCaller = () => caller({ "x-abu-staff-session": managerLogin.token });

    const approved = await managerCaller().staffSync.approve({ email: "worker@example.com", role: "admin" });
    expect(approved.user).toMatchObject({ email: "worker@example.com", role: "admin", status: "APPROVED", isApproved: true });

    const workerLogin = await caller().staffSync.login({ email: "worker@example.com", password: "worker-pass" });
    expect(workerLogin.user).toMatchObject({ role: "admin", isApproved: true });

    const blocked = await managerCaller().staffSync.update({ email: "worker@example.com", isBlocked: true });
    expect(blocked.user).toMatchObject({ isBlocked: true });
    await expect(caller().staffSync.login({ email: "worker@example.com", password: "worker-pass" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    await managerCaller().staffSync.remove({ email: "worker@example.com" });
    await expect(caller().staffSync.login({ email: "worker@example.com", password: "worker-pass" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("refreshes the role for an existing session after promotion to supervisor", async () => {
    mockAccountStore();
    await caller().staffSync.register({ email: "manager@example.com", password: "manager-pass" });
    const managerLogin = await caller().staffSync.login({ email: "manager@example.com", password: "manager-pass" });
    await caller({ "x-abu-staff-session": managerLogin.token }).staffSync.register({ email: "worker@example.com", password: "worker-pass" });
    await caller({ "x-abu-staff-session": managerLogin.token }).staffSync.approve({ email: "worker@example.com", role: "seller" });
    const workerLogin = await caller().staffSync.login({ email: "worker@example.com", password: "worker-pass" });

    await db.updateStaffAccount("worker@example.com", { role: "admin" });
    const refreshed = await caller({ "x-abu-staff-session": workerLogin.token }).staffSync.me();
    expect(refreshed).toMatchObject({ email: "worker@example.com", role: "admin", isApproved: true });
  });
});
