import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

export type StoreRewardRow = Database["public"]["Tables"]["store_rewards"]["Row"];
export type StaffPointsRow = Database["public"]["Tables"]["staff_points_ledger"]["Row"];
export type StaffPointEntryType = "task_earned" | "penalty" | "reward_redeemed" | "manual_adjustment" | "reset";

export type GamificationEmployee = {
  id: string;
  name: string;
  currentPoints: number;
  rewards: StoreRewardRow[];
  claimedRewards: Array<{ rewardName: string; pointsUsed: number; claimedDate: string }>;
  createdDate: string;
  pointHistory: Array<{ id: string; type: "earned" | "deduction" | "reset"; points: number; description: string; createdAt: string }>;
};

const MANAGER_ROLES = ["manager", "admin", "supervisor"] as const;

async function contextForPoints() {
  const context = await getActiveShopContext(true);
  if (!(MANAGER_ROLES as readonly string[]).includes(context.role)) throw new Error("هذه المنظومة متاحة للمدير أو المدير الإداري أو المشرف فقط.");
  return context;
}

export function mapGamificationEmployees(
  staff: Array<{ id: string; name: string; created_at?: string }>,
  ledger: StaffPointsRow[],
  rewards: StoreRewardRow[],
): GamificationEmployee[] {
  return staff.map(employee => {
    const history = ledger.filter(row => row.employee_id === employee.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      id: employee.id,
      name: employee.name,
      currentPoints: history.reduce((sum, row) => sum + Number(row.points_delta || 0), 0),
      rewards,
      claimedRewards: history.filter(row => row.entry_type === "reward_redeemed").map(row => ({ rewardName: row.description.replace(/^استلام الجائزة:\s*/, ""), pointsUsed: Math.abs(row.points_delta), claimedDate: row.created_at })),
      createdDate: employee.created_at || new Date().toISOString(),
      pointHistory: history.map(row => ({ id: row.id, type: row.points_delta < 0 ? "deduction" : row.entry_type === "reset" ? "reset" : "earned", points: row.points_delta, description: row.description, createdAt: row.created_at })),
    };
  });
}

export async function listStaffGamification(): Promise<{ employees: GamificationEmployee[]; rewards: StoreRewardRow[] }> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  const client = getSupabaseClient();
  const [staffResult, ledgerResult, rewardsResult] = await Promise.all([
    client.rpc("list_task_staff_directory", { p_shop_id: shopId }),
    client.from("staff_points_ledger").select("*").eq("store_id", shopId).order("created_at", { ascending: false }).limit(10000),
    client.from("store_rewards").select("*").eq("store_id", shopId).order("points_required").limit(500),
  ]);
  const staff = requireCloudResult(staffResult) as Array<{ id: string; name: string; role: string }>;
  const ledger = requireCloudResult(ledgerResult) as StaffPointsRow[];
  const rewards = requireCloudResult(rewardsResult) as StoreRewardRow[];
  return { employees: mapGamificationEmployees(staff, ledger, rewards), rewards };
}

export async function listStaffPointBalances(): Promise<GamificationEmployee[]> {
  return (await listStaffGamification()).employees;
}

export async function createStoreReward(input: { title: string; description?: string; pointsRequired: number; availableQuantity: number; icon?: string }): Promise<StoreRewardRow> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  const title = input.title.trim();
  if (!title || input.pointsRequired <= 0 || input.availableQuantity < 0) throw new Error("أدخل اسم الجائزة والنقاط والكمية بشكل صحيح.");
  const result = await getSupabaseClient().from("store_rewards").insert({ store_id: shopId, title, description: input.description?.trim() || null, points_required: Math.floor(input.pointsRequired), available_quantity: Math.floor(input.availableQuantity), icon: input.icon?.trim() || null }).select().single();
  return requireCloudResult(result) as StoreRewardRow;
}

export async function deleteStoreReward(rewardId: string): Promise<void> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  requireCloudResult(await getSupabaseClient().from("store_rewards").delete().eq("id", rewardId).eq("store_id", shopId).select("id").single());
}

export async function awardCompletedTaskPoints(taskId: string): Promise<StaffPointsRow> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  return requireCloudResult(await getSupabaseClient().rpc("award_completed_task_points", { p_shop_id: shopId, p_task_id: taskId })) as StaffPointsRow;
}

export async function applyStaffPointAdjustment(input: { employeeId: string; pointsDelta: number; entryType: "penalty" | "manual_adjustment" | "reset"; sourceId: string; description: string }): Promise<StaffPointsRow> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  return requireCloudResult(await getSupabaseClient().rpc("apply_staff_point_adjustment", { p_shop_id: shopId, p_employee_id: input.employeeId, p_points_delta: Math.trunc(input.pointsDelta), p_entry_type: input.entryType, p_source_id: input.sourceId, p_description: input.description })) as StaffPointsRow;
}

export async function redeemStoreReward(employeeId: string, rewardId: string): Promise<StaffPointsRow> {
  assertCloudOnline();
  const { shopId } = await contextForPoints();
  return requireCloudResult(await getSupabaseClient().rpc("redeem_staff_reward", { p_shop_id: shopId, p_employee_id: employeeId, p_reward_id: rewardId })) as StaffPointsRow;
}

export async function subscribeToGamification(onChange: () => void): Promise<() => Promise<unknown>> {
  const { shopId } = await contextForPoints();
  const client = getSupabaseClient();
  const channel = client.channel(`staff-gamification:${shopId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "staff_points_ledger", filter: `store_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "store_rewards", filter: `store_id=eq.${shopId}` }, onChange)
    .subscribe();
  return async () => { await client.removeChannel(channel); };
}
