import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";

export type PasswordResetRequest = {
  id: string;
  shop_id: string;
  employee_id: string | null;
  employee_name: string | null;
  identifier: string;
  requested_email: string | null;
  requested_phone: string | null;
  status: string;
  created_at: string;
};

export async function requestStaffPasswordReset(identifier: string) {
  assertCloudOnline();
  const { data, error } = await getSupabaseClient().rpc("request_staff_password_reset", { p_identifier: identifier.trim() });
  return requireCloudResult({ data, error }) as { accepted: boolean; message?: string };
}

export async function listStaffPasswordResetRequests() {
  const context = await getActiveShopContext(true);
  if (!context.role || !["manager", "admin", "supervisor"].includes(context.role)) throw new Error("طلبات الاستعادة متاحة للإدارة فقط.");
  const { data, error } = await getSupabaseClient().rpc("list_staff_password_reset_requests", { p_shop_id: context.shopId });
  return requireCloudResult({ data, error }) as PasswordResetRequest[];
}

export async function managerSetStaffPassword(employeeId: string, password: string) {
  assertCloudOnline();
  const context = await getActiveShopContext(true);
  if (!context.role || !["manager", "admin", "supervisor"].includes(context.role)) throw new Error("تعيين كلمات المرور متاح للإدارة فقط.");
  const { data, error } = await getSupabaseClient().rpc("manager_set_staff_password", { p_shop_id: context.shopId, p_employee_id: employeeId, p_password: password });
  return requireCloudResult({ data, error }) as { success: boolean };
}
