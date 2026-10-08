import { describe, expect, it } from "vitest";
import { normalizeAttendance, normalizeEmployees } from "../client/src/lib/employeeData";

describe("بيانات إدارة الموظفين", () => {
  it("يحوّل راتب السجل القديم النصي إلى رقم آمن للعرض", () => {
    const employees = normalizeEmployees([{ id: "e1", name: "أحمد", salary: "2500", position: null }]);
    expect(employees).toEqual([{ id: "e1", name: "أحمد", phone: "", position: "", salary: 2500, joinDate: "غير مسجل" }]);
  });

  it("يتجاهل سجل الحضور التالف بدل أن يعطل الصفحة", () => {
    expect(normalizeAttendance({ broken: true })).toEqual([]);
  });
});
