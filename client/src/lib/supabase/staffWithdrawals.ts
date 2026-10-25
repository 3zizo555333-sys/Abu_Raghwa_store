import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";

export type StaffWithdrawalStatus = "pending" | "approved" | "rejected";
export type StaffEmployee = {
  id: string;
  name: string;
  phone: string;
  position: string;
  role: "supervisor" | "cashier" | "seller";
  salary: number;
  join_date: string;
  hire_date: string;
  is_active: boolean;
};
export type StaffWithdrawal = {
  id: string;
  shop_id: string;
  employee_id: string;
  amount: number;
  description: string;
  status: StaffWithdrawalStatus;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};
export type StaffAttendance = { employee_id: string; attendance_date: string; status: string };

export async function bindCurrentStaffEmployee(shopId: string) {
  return requireCloudResult(await getSupabaseClient().rpc("bind_staff_employee_auth", { p_shop_id: shopId }));
}

export async function listStaffFinanceData(shopId: string) {
  const supabase = getSupabaseClient();
  const [employeesResult, withdrawalsResult, attendanceResult] = await Promise.all([
    supabase.from("staff_employees").select("id,name,phone,position,role,salary,join_date,hire_date,is_active").eq("shop_id", shopId).is("deleted_at", null).order("name"),
    supabase.from("staff_withdrawals").select("id,shop_id,employee_id,amount,description,status,requested_at,reviewed_at,reviewed_by").eq("shop_id", shopId).order("requested_at", { ascending: false }),
    supabase.from("staff_attendance").select("employee_id,attendance_date,status").eq("shop_id", shopId),
  ]);
  return {
    employees: requireCloudResult({ data: employeesResult.data as StaffEmployee[] | null, error: employeesResult.error }),
    withdrawals: requireCloudResult({ data: withdrawalsResult.data as StaffWithdrawal[] | null, error: withdrawalsResult.error }),
    attendance: requireCloudResult({ data: attendanceResult.data as StaffAttendance[] | null, error: attendanceResult.error }),
  };
}

export async function getCurrentStaffEmployee(shopId: string): Promise<StaffEmployee> {
  const supabase = getSupabaseClient();
  const { data: authResult, error: authError } = await supabase.auth.getUser();
  if (authError || !authResult.user) throw new Error("انتهت جلسة الدخول السحابية. سجّل الدخول مجدداً.");
  const email = authResult.user.email?.toLowerCase() ?? "";
  const query = supabase.from("staff_employees").select("id,name,phone,position,role,salary,join_date,hire_date,is_active").eq("shop_id", shopId).is("deleted_at", null);
  const { data, error } = email
    ? await query.or(`auth_user_id.eq.${authResult.user.id},auth_email.ilike.${email}`).limit(2)
    : await query.eq("auth_user_id", authResult.user.id).limit(2);
  const rows = requireCloudResult({ data: data as StaffEmployee[] | null, error });
  const employee = rows.find(item => item.is_active);
  if (!employee) throw new Error("لا يوجد سجل موظف نشط مرتبط بحسابك.");
  return employee;
}

export async function listOwnStaffWithdrawals(shopId: string, employeeId: string) {
  const { data, error } = await getSupabaseClient()
    .from("staff_withdrawals")
    .select("id,shop_id,employee_id,amount,description,status,requested_at,reviewed_at,reviewed_by")
    .eq("shop_id", shopId)
    .eq("employee_id", employeeId)
    .order("requested_at", { ascending: false });
  return requireCloudResult({ data: data as StaffWithdrawal[] | null, error });
}

export async function listOwnStaffAttendance(shopId: string, employeeId: string) {
  const { data, error } = await getSupabaseClient()
    .from("staff_attendance")
    .select("employee_id,attendance_date,status")
    .eq("shop_id", shopId)
    .eq("employee_id", employeeId)
    .order("attendance_date", { ascending: false })
    .limit(1000);
  return requireCloudResult({ data: data as StaffAttendance[] | null, error });
}

export async function createStaffWithdrawal(input: { shopId: string; employeeId: string; amount: number; description: string }) {
  assertCloudOnline();
  const { data, error } = await getSupabaseClient().from("staff_withdrawals").insert({
    shop_id: input.shopId,
    employee_id: input.employeeId,
    amount: input.amount,
    description: input.description.trim(),
    status: "pending",
  }).select("id,shop_id,employee_id,amount,description,status,requested_at,reviewed_at,reviewed_by").single();
  return requireCloudResult({ data: data as StaffWithdrawal | null, error });
}

export async function updateStaffWithdrawal(input: { id: string; amount: number; description: string; status?: StaffWithdrawalStatus }) {
  assertCloudOnline();
  const patch: Partial<StaffWithdrawal> = { amount: input.amount, description: input.description.trim() };
  if (input.status) patch.status = input.status;
  const { data, error } = await getSupabaseClient().from("staff_withdrawals").update(patch).eq("id", input.id).select("id,shop_id,employee_id,amount,description,status,requested_at,reviewed_at,reviewed_by").single();
  return requireCloudResult({ data: data as StaffWithdrawal | null, error });
}

export async function reviewStaffWithdrawal(id: string, status: "approved" | "rejected", reviewerId: string) {
  assertCloudOnline();
  const { data, error } = await getSupabaseClient().from("staff_withdrawals").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId }).eq("id", id).eq("status", "pending").select("id,shop_id,employee_id,amount,description,status,requested_at,reviewed_at,reviewed_by").single();
  return requireCloudResult({ data: data as StaffWithdrawal | null, error });
}

export async function deleteStaffWithdrawal(id: string) {
  assertCloudOnline();
  const { error } = await getSupabaseClient().from("staff_withdrawals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
