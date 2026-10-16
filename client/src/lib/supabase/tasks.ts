import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

export type CloudTaskRow = Database["public"]["Tables"]["store_tasks"]["Row"];
export type CloudTaskInsert = Database["public"]["Tables"]["store_tasks"]["Insert"];
export type TaskStatus = "pending" | "in-progress" | "completed";
export type TaskPriority = "low" | "medium" | "high";

const MANAGER_ROLES = ["manager", "admin", "supervisor"] as const;

function requireTaskManager(role: string): void {
  if (!(MANAGER_ROLES as readonly string[]).includes(role)) {
    throw new Error("إدارة المهام متاحة للمدير أو المدير الإداري أو المشرف فقط.");
  }
}

export function toStoredStatus(status: TaskStatus): "pending" | "in_progress" | "completed" {
  return status === "in-progress" ? "in_progress" : status;
}

export function toDisplayStatus(status: string): TaskStatus {
  return status === "in_progress" ? "in-progress" : status === "completed" ? "completed" : "pending";
}

export function mapTaskRow(row: CloudTaskRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    assignedTo: row.assigned_to ?? "",
    dueDate: row.due_date ?? "",
    priority: (row.priority === "low" || row.priority === "high" ? row.priority : "medium") as TaskPriority,
    status: toDisplayStatus(row.status),
    createdDate: row.created_at,
    pointsValue: row.points_value,
    pointsAwarded: row.points_awarded,
  };
}

export function cleanTaskInsert(input: {
  title: string;
  description?: string;
  assignedTo: string;
  dueDate?: string;
  priority: TaskPriority;
  pointsValue: number;
}): Omit<CloudTaskInsert, "store_id" | "created_by"> {
  const title = input.title.trim();
  if (!title) throw new Error("اكتب اسم المهمة أولاً.");
  if (!input.assignedTo) throw new Error("اختر الموظف المسؤول عن المهمة.");
  const pointsValue = Math.floor(Number(input.pointsValue));
  if (!Number.isFinite(pointsValue) || pointsValue <= 0) throw new Error("حدد عدد نقاط صحيحاً أكبر من صفر.");
  return {
    title,
    description: input.description?.trim() || null,
    assigned_to: input.assignedTo,
    due_date: input.dueDate || null,
    priority: input.priority,
    status: "pending",
    points_value: pointsValue,
    points_awarded: false,
  };
}

async function taskContext() {
  const context = await getActiveShopContext();
  requireTaskManager(context.role);
  return context;
}

export async function listCloudTasks(): Promise<CloudTaskRow[]> {
  assertCloudOnline();
  const { shopId } = await taskContext();
  const result = await getSupabaseClient()
    .from("store_tasks")
    .select("*")
    .eq("store_id", shopId)
    .order("created_at", { ascending: false })
    .limit(1000);
  return requireCloudResult(result) as CloudTaskRow[];
}

export async function createCloudTask(input: Parameters<typeof cleanTaskInsert>[0]): Promise<CloudTaskRow> {
  assertCloudOnline();
  const { shopId, userId } = await taskContext();
  const payload = { ...cleanTaskInsert(input), store_id: shopId, created_by: userId } as CloudTaskInsert;
  const result = await getSupabaseClient().from("store_tasks").insert(payload).select().single();
  return requireCloudResult(result) as CloudTaskRow;
}

export async function updateCloudTaskStatus(taskId: string, status: TaskStatus, pointsAwarded: boolean): Promise<CloudTaskRow> {
  assertCloudOnline();
  const { shopId } = await taskContext();
  const result = await getSupabaseClient()
    .from("store_tasks")
    .update({ status: toStoredStatus(status), points_awarded: pointsAwarded, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("store_id", shopId)
    .select()
    .single();
  return requireCloudResult(result) as CloudTaskRow;
}

export async function deleteCloudTask(taskId: string): Promise<void> {
  assertCloudOnline();
  const { shopId } = await taskContext();
  const result = await getSupabaseClient().from("store_tasks").delete().eq("id", taskId).eq("store_id", shopId).select("id").single();
  requireCloudResult(result);
}

export async function subscribeToCloudTasks(onChange: () => void) {
  const { shopId } = await taskContext();
  const channel = getSupabaseClient()
    .channel(`store_tasks:${shopId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "store_tasks", filter: `store_id=eq.${shopId}` }, onChange)
    .subscribe();
  return () => { void getSupabaseClient().removeChannel(channel); };
}
