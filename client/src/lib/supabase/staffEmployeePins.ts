import { getActiveShopContext } from "./products";
import { getSupabaseClient, requireCloudResult } from "./client";

export type StaffPinEmployee = {
  id: string;
  name: string;
  phone: string;
  position: string;
  role: "manager" | "supervisor" | "cashier" | "seller";
  salary: number;
  join_date: string;
  hire_date: string;
  shop_id: string;
  is_active: boolean;
};
export type StaffPinStatus = { employee_id: string; pin_configured: boolean; pin_enabled: boolean };

export function normalizeEmployeePin(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/\s/g, "")
    .replace(/\D/g, "");
}

/** Remove only legacy PIN-attempt/lock keys; no active app code stores PINs locally. */
export function clearEmployeePinLockStorage() {
  if (typeof window === "undefined") return;
  try {
    const knownKeys = [
      "abu_employee_pin_attempts",
      "abu_employee_pin_locked_until",
      "staff_employee_pin_attempts",
      "staff_employee_pin_locked_until",
      "employee_withdrawal_pin_lock",
    ];
    const legacyKeys = Object.keys(window.localStorage).filter(key =>
      /(?:staff|employee)[_.:-]*pin.*(?:attempt|lock)|pin.*(?:attempt|lock).*(?:staff|employee)/i.test(key),
    );
    Array.from(new Set([...knownKeys, ...legacyKeys])).forEach(key => window.localStorage.removeItem(key));
  } catch {
    // Storage can be unavailable in restricted browser contexts; the server lock is authoritative.
  }
}

export async function adminSetStaffEmployeePin(employeeId: string, pin: string) {
  const normalizedPin = normalizeEmployeePin(pin);
  if (normalizedPin.length !== 4) throw new Error("يجب أن يتكون PIN الموظف من 4 أرقام.");
  const result = await getSupabaseClient().rpc("admin_set_employee_pin", {
    p_employee_id: employeeId,
    p_pin: normalizedPin,
  });
  return requireCloudResult(result);
}

export async function resetStaffEmployeePinAttempts(employeeId: string) {
  const result = await getSupabaseClient().rpc("admin_reset_employee_pin_attempts", {
    p_employee_id: employeeId,
  });
  return requireCloudResult(result);
}

export async function listStaffEmployeePinStatuses() {
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("list_staff_employee_pin_statuses", { p_shop_id: shopId });
  return requireCloudResult(result);
}

export async function setStaffEmployeePinAccess(employeeId: string, enabled: boolean) {
  const result = await getSupabaseClient().rpc("admin_set_employee_pin_access", {
    p_employee_id: employeeId,
    p_enabled: enabled,
  });
  return requireCloudResult(result);
}

export async function verifyCurrentStaffPin(shopId: string, pin: string): Promise<StaffPinEmployee> {
  const normalizedPin = normalizeEmployeePin(pin);
  if (normalizedPin.length !== 4) throw new Error("أدخل PIN مكوّناً من 4 أرقام.");
  const result = await getSupabaseClient().rpc("verify_current_staff_pin", {
    p_shop_id: shopId,
    p_pin: normalizedPin,
  });
  const response = requireCloudResult(result) as { success?: boolean; locked?: boolean; employee?: StaffPinEmployee };
  if (!response.success || !response.employee) {
    throw new Error(response.locked ? "تم قفل محاولات PIN مؤقتاً؛ أعد المحاولة بعد 15 دقيقة." : "رمز PIN غير صحيح أو لا يوجد سجل موظف نشط مرتبط بهذا الحساب.");
  }
  return response.employee;
}

export async function verifyStaffPinAccess(shopId: string, pin: string): Promise<StaffPinEmployee> {
  const normalizedPin = normalizeEmployeePin(pin);
  if (normalizedPin.length !== 4) throw new Error("أدخل PIN مكوّناً من 4 أرقام.");
  const result = await getSupabaseClient().rpc("verify_staff_pin_access", {
    p_shop_id: shopId,
    p_pin: normalizedPin,
  });
  const response = requireCloudResult(result) as { success?: boolean; locked?: boolean; employee?: StaffPinEmployee };
  if (!response.success || !response.employee) {
    throw new Error(response.locked ? "تم قفل محاولات PIN مؤقتاً؛ أعد المحاولة بعد 15 دقيقة." : "رمز PIN غير صحيح أو غير فريد أو لا يوجد موظف نشط مرتبط به.");
  }
  return response.employee;
}
