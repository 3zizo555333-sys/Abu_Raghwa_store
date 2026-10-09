import { createHash } from "node:crypto";

export const EMPLOYEE_FINANCE_KEY = "abu_raghwa_employee_finance";

export type FinanceAssignment = {
  employeeId: string;
  employeeEmail?: string;
  pinHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WithdrawalStatus = "pending" | "approved" | "rejected";

export type FinanceWithdrawal = {
  id: string;
  employeeId: string;
  amount: number;
  description: string;
  requestedAt: string;
  requestedByEmail: string;
  status: WithdrawalStatus;
  reviewedAt?: string;
  reviewedByEmail?: string;
};

export type EmployeeFinanceStore = {
  profiles: FinanceEmployee[];
  assignments: FinanceAssignment[];
  withdrawals: FinanceWithdrawal[];
  managerWithdrawals: ManagerWithdrawal[];
};

export type ManagerWithdrawal = { id: string; amount: number; description: string; recordedAt: string };

export type FinanceEmployee = { id: string; name: string; position?: string; salary: number; joinDate?: string; phone?: string };
export type FinanceAttendance = { employeeId: string; date: string; status: string };

const asString = (value: unknown) => typeof value === "string" ? value : "";
const asAmount = (value: unknown) => Math.max(0, Number(value) || 0);

export function hashEmployeeFinancePin(pin: string) {
  return createHash("sha256").update(`abu-raghwa-employee-finance:${pin}`).digest("hex");
}

export function normalizeEmployeeFinanceStore(value: unknown): EmployeeFinanceStore {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const profiles = Array.isArray(source.profiles) ? source.profiles.map(item => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { id: asString(data.id), name: asString(data.name), position: asString(data.position), salary: asAmount(data.salary), joinDate: asString(data.joinDate), phone: asString(data.phone) };
  }).filter(item => item.id && item.name) : [];
  const assignments = Array.isArray(source.assignments) ? source.assignments.map(item => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { employeeId: asString(data.employeeId), employeeEmail: asString(data.employeeEmail).toLowerCase(), pinHash: asString(data.pinHash), isActive: data.isActive !== false, createdAt: asString(data.createdAt), updatedAt: asString(data.updatedAt) };
  }).filter(item => item.employeeId && item.pinHash) : [];
  const withdrawals = Array.isArray(source.withdrawals) ? source.withdrawals.map(item => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const status: WithdrawalStatus = data.status === "approved" || data.status === "rejected" ? data.status : "pending";
    return { id: asString(data.id), employeeId: asString(data.employeeId), amount: asAmount(data.amount), description: asString(data.description), requestedAt: asString(data.requestedAt), requestedByEmail: asString(data.requestedByEmail), status, reviewedAt: asString(data.reviewedAt) || undefined, reviewedByEmail: asString(data.reviewedByEmail) || undefined };
  }).filter(item => item.id && item.employeeId && item.amount > 0 && item.requestedAt) : [];
  const managerWithdrawals = Array.isArray(source.managerWithdrawals) ? source.managerWithdrawals.map(item => {
    const data = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { id: asString(data.id), amount: asAmount(data.amount), description: asString(data.description), recordedAt: asString(data.recordedAt) };
  }).filter(item => item.id && item.amount > 0 && item.recordedAt) : [];
  return { profiles, assignments, withdrawals, managerWithdrawals };
}

function toLatinDigits(value: string) {
  return value.replace(/[٠-٩]/g, char => String("٠١٢٣٤٥٦٧٨٩".indexOf(char))).replace(/[۰-۹]/g, char => String("۰۱۲۳۴۵۶۷۸۹".indexOf(char)));
}

function parseBusinessDate(value?: string) {
  const raw = toLatinDigits(value || "").trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const parts = raw.replace(/[^0-9/-]/g, "").split(/[/-]/).filter(Boolean);
  if (parts.length >= 3) {
    const [day, month, year] = parts;
    if (year?.length === 4) return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function getMonthKey(value: string | Date) {
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  const raw = toLatinDigits(value).replace(/[^0-9/-]/g, "");
  const iso = raw.match(/^(\d{4})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const parts = raw.split(/[/-]/).filter(Boolean);
  if (parts.length >= 3) {
    const [day, month, year] = parts;
    if (year?.length === 4) return `${year}-${String(Number(month)).padStart(2, "0")}`;
  }
  return "";
}

export function buildEmployeeFinanceSummary(employee: FinanceEmployee, attendance: FinanceAttendance[], withdrawals: FinanceWithdrawal[], now = new Date()) {
  const monthKey = getMonthKey(now);
  const attendanceDays = attendance.filter(item => item.employeeId === employee.id && item.status === "present" && getMonthKey(item.date) === monthKey).length;
  const currentDay = startOfDay(now);
  const monthStart = new Date(currentDay.getFullYear(), currentDay.getMonth(), 1);
  const joinedAt = parseBusinessDate(employee.joinDate);
  const eligibleStart = joinedAt ? new Date(Math.max(startOfDay(joinedAt).getTime(), monthStart.getTime())) : null;
  const automaticWorkedDays = eligibleStart && eligibleStart <= currentDay
    ? Math.floor((currentDay.getTime() - eligibleStart.getTime()) / 86_400_000) + 1
    : 0;
  // الموظف صاحب تاريخ بداية مسجل لا يحتاج إدخال حضور يومي حتى يبدأ عداده.
  // أما السجلات القديمة بلا تاريخ بداية فتظل تعتمد على الحضور المسجل كي لا يتغير حسابها فجأة.
  const workedDays = joinedAt ? automaticWorkedDays : attendanceDays;
  const monthlySalary = asAmount(employee.salary);
  const dailyRate = monthlySalary / 30;
  const earnedAmount = workedDays * dailyRate;
  const monthlyWithdrawals = withdrawals.filter(item => item.employeeId === employee.id && getMonthKey(item.requestedAt) === monthKey);
  const approvedWithdrawals = monthlyWithdrawals.filter(item => item.status === "approved").reduce((total, item) => total + item.amount, 0);
  const pendingWithdrawals = monthlyWithdrawals.filter(item => item.status === "pending").reduce((total, item) => total + item.amount, 0);
  const registeredWithdrawals = approvedWithdrawals + pendingWithdrawals;
  return { monthKey, monthlySalary, dailyRate, workedDays, attendanceDays, automaticWorkedDays, calculationMode: joinedAt ? "start_date" as const : "attendance" as const, earnedAmount, approvedWithdrawals, pendingWithdrawals, registeredWithdrawals, remainingAmount: earnedAmount - registeredWithdrawals };
}
