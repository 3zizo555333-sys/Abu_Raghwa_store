import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";

export type CloudStaffMember = {
  user_id: string;
  email: string;
  display_name: string | null;
  role: "manager" | "admin" | "supervisor" | "seller";
  status: "pending" | "active" | "suspended";
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
};

async function managerShopId(): Promise<string> {
  const context = await getActiveShopContext(true);
  if (context.role !== "manager") throw new Error("إدارة عضويات الموظفين متاحة للمدير فقط.");
  return context.shopId;
}

export async function listShopMembers(): Promise<CloudStaffMember[]> {
  const supabase = getSupabaseClient();
  const shopId = await managerShopId();
  const { data, error } = await supabase.rpc("list_shop_members", { p_shop_id: shopId });
  return requireCloudResult({ data, error });
}

export async function updateShopMember(input: {
  userId: string;
  role: "admin" | "seller";
  status: "pending" | "active" | "suspended";
}): Promise<CloudStaffMember> {
  assertCloudOnline();
  const supabase = getSupabaseClient();
  const shopId = await managerShopId();
  const { error } = await supabase.rpc("set_shop_membership", {
    p_shop_id: shopId,
    p_user_id: input.userId,
    p_role: input.role,
    p_status: input.status,
  });
  if (error) {
    if (/failed to fetch|network|connection|offline/i.test(error.message)) {
      throw new Error("لا يوجد اتصال بالإنترنت. تم تعطيل حفظ الصلاحيات ولم تُخزّن أي تغييرات محليًا.");
    }
    throw new Error(error.message);
  }
  // Refetch the authoritative membership; never treat a local optimistic row as saved.
  const refreshed = await listShopMembers();
  const member = refreshed.find(item => item.user_id === input.userId);
  if (!member) throw new Error("لم يؤكد الخادم تحديث العضوية؛ أعد تحميل القائمة.");
  return member;
}
