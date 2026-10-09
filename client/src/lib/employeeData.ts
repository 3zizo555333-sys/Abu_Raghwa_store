export interface EmployeeRecord {
  id: string;
  name: string;
  phone: string;
  position: string;
  salary: number;
  joinDate: string;
}

export interface AttendanceRecord {
  id: string;
  employeeId: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: "present" | "absent" | "late";
}

const text = (value: unknown) => typeof value === "string" ? value : value == null ? "" : String(value);
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** يحوّل السجلات القديمة أو الناقصة إلى شكل آمن للعرض، حتى لا تتعطل الصفحة. */
export const normalizeEmployees = (value: unknown): EmployeeRecord[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return {
      id: text(source.id) || `legacy-employee-${index}`,
      name: text(source.name) || "موظف بدون اسم",
      phone: text(source.phone),
      position: text(source.position),
      salary: Math.max(0, number(source.salary)),
      joinDate: text(source.joinDate) || "غير مسجل",
    };
  });
};

export const normalizeAttendance = (value: unknown): AttendanceRecord[] => {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const source = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const status = source.status === "absent" || source.status === "late" ? source.status : "present";
    return {
      id: text(source.id) || `legacy-attendance-${index}`,
      employeeId: text(source.employeeId),
      date: text(source.date),
      checkIn: text(source.checkIn),
      checkOut: text(source.checkOut),
      status,
    };
  });
};
