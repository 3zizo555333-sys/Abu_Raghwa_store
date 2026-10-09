import { getSupabaseClient } from "./client";
import type { AccessUser } from "@/lib/accessControl";

export const CURRENT_STAFF_QUERY_KEY = ["supabase", "current-staff"] as const;

export type MembershipState = "active" | "pending" | "suspended" | "missing" | "multiple";

export type CloudStaffSession = {
  user: AccessUser;
  shopId: string | null;
  membershipState: MembershipState;
};

/** Resolve role and shop membership from Supabase on every session refresh. */
export async function loadCurrentStaffSession(): Promise<CloudStaffSession | null> {
  const supabase = getSupabaseClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(/failed to fetch|network|connection|offline/i.test(authError.message)
    ? "لا يوجد اتصال بالسحابة للتحقق من الجلسة. تحقّق من الإنترنت ثم أعد المحاولة."
    : authError.message);
  const authUser = authData.user;
  if (!authUser) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", authUser.id)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);

  const { data: memberships, error: membershipError } = await supabase
    .from("shop_memberships")
    .select("shop_id, role, status")
    .eq("user_id", authUser.id)
    .limit(2);
  if (membershipError) throw new Error(membershipError.message);

  let membershipState: MembershipState = "missing";
  let shopId: string | null = null;
  let role: AccessUser["role"] = "seller";
  if (memberships && memberships.length > 1) {
    membershipState = "multiple";
  } else if (memberships?.length === 1) {
    const membership = memberships[0];
    membershipState = membership.status;
    shopId = membership.shop_id;
    role = membership.role;
  }

  const user: AccessUser = {
    id: authUser.id,
    email: authUser.email ?? "",
    name: profile?.display_name ?? authUser.user_metadata?.full_name ?? authUser.email ?? "",
    role,
    createdDate: authUser.created_at,
    lastLogin: authUser.last_sign_in_at ?? authUser.created_at,
    deviceIds: [],
    isApproved: membershipState === "active",
    isBlocked: membershipState === "suspended",
    status: membershipState,
  };
  return { user, shopId, membershipState };
}
