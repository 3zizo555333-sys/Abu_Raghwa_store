import { describe, expect, it } from "vitest";
import { normalizeEmployeePin } from "./staffEmployeePins";
import { calculateStaffWithdrawalBalance, requestedAtForDate, transactionTypeLabel } from "./staffWithdrawalFinance";

describe("PIN الموظف وسجل السحوبات الشخصية", () => {
  it("يوحّد الأرقام العربية والفارسية ويزيل الفراغات عند الإدخال", () => {
    expect(normalizeEmployeePin(" ١٢ ٣٤ ")).toBe("1234");
    expect(normalizeEmployeePin("۱۲۳۴")).toBe("1234");
    expect(normalizeEmployeePin("12345")).toBe("12345");
  });

  it("يخصم السحوبات المعلقة والمعتمدة فوراً ولا يخصم المرفوضة أو سجلات الآخرين", () => {
    const result = calculateStaffWithdrawalBalance("employee-1", 1_000, [
      { employee_id: "employee-1", amount: 100, status: "approved" },
      { employee_id: "employee-1", amount: 75, status: "pending" },
      { employee_id: "employee-1", amount: 50, status: "rejected" },
      { employee_id: "employee-2", amount: 300, status: "pending" },
    ]);
    expect(result).toEqual({
      approvedWithdrawals: 100,
      pendingWithdrawals: 75,
      rejectedWithdrawals: 50,
      withdrawalsTotal: 175,
      remainingAmount: 825,
    });
  });

  it("يحفظ التاريخ المختار منتصف اليوم بتوقيت UTC ويعرض نوع الحركة", () => {
    expect(requestedAtForDate("2026-11-19")).toBe("2026-11-19T12:00:00.000Z");
    expect(transactionTypeLabel("expense")).toBe("مصروف");
    expect(transactionTypeLabel("withdrawal")).toBe("سحب");
    expect(() => requestedAtForDate("19/11/2026")).toThrow();
  });
});
