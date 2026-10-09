import { describe, expect, it } from "vitest";
import { isUserAllowed, withUserAccess, type AccessUser } from "../client/src/lib/accessControl";

const employee: AccessUser = {
  id: "employee-1", email: "employee@example.com", password: "secret", role: "seller",
  createdDate: "2026-01-01", lastLogin: "2026-01-01", deviceIds: [], isApproved: true,
};

describe("التحكم في دخول الموظفين", () => {
  it("يمنع الموظف الموقوف ويسمح له مجدداً عند التفعيل", () => {
    expect(isUserAllowed(employee)).toBe(true);
    const stopped = withUserAccess([employee], employee.id, true)[0];
    expect(isUserAllowed(stopped)).toBe(false);
    const restored = withUserAccess([stopped], employee.id, false)[0];
    expect(isUserAllowed(restored)).toBe(true);
  });
});
