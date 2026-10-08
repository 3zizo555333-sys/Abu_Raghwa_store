import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
export type CloudExpense = {
  id: string;
  version: number;
  name: string;
  amount: number;
  category: string;
  date: string;
  type: "daily" | "monthly";
  notes: string;
};

export type ExpenseInput = Omit<CloudExpense, "id" | "version">;
export type ExpenseSummary = { totalRevenue: number; totalProfit: number };

function toCloudExpense(row: ExpenseRow): CloudExpense {
  return {
    id: row.id,
    version: row.version,
    name: row.description,
    amount: Number(row.amount),
    category: row.category,
    date: row.occurred_at.slice(0, 10),
    type: row.expense_type,
    notes: row.notes,
  };
}

function toPayload(input: ExpenseInput) {
  return {
    description: input.name.trim(),
    amount: input.amount,
    category: input.category,
    occurred_at: `${input.date}T12:00:00.000Z`,
    expense_type: input.type,
    notes: input.notes,
  };
}

export async function listCloudExpenses(): Promise<CloudExpense[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient()
    .from("expenses")
    .select("*")
    .eq("shop_id", shopId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .order("id", { ascending: false });
  const rows = requireCloudResult(result) as ExpenseRow[];
  return rows.map(toCloudExpense);
}

export async function saveCloudExpense(input: ExpenseInput, current?: Pick<CloudExpense, "id" | "version">): Promise<CloudExpense> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("save_expense", {
    p_shop_id: shopId,
    p_expense_id: current?.id ?? null,
    p_expected_version: current?.version ?? null,
    p_payload: toPayload(input),
  });
  const row = requireCloudResult(result);
  return toCloudExpense(row);
}

export async function deleteCloudExpense(expense: Pick<CloudExpense, "id" | "version">): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("delete_expense", {
    p_shop_id: shopId,
    p_expense_id: expense.id,
    p_expected_version: expense.version,
  });
  requireCloudResult(result);
}

export async function getCloudExpenseSummary(): Promise<ExpenseSummary> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("get_expense_summary", { p_shop_id: shopId });
  const value = requireCloudResult(result);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("أعاد الخادم ملخصًا ماليًا غير صالح.");
  }
  const summary = value as Record<string, unknown>;
  const totalRevenue = Number(summary.total_revenue);
  const totalProfit = Number(summary.total_profit);
  if (!Number.isFinite(totalRevenue) || !Number.isFinite(totalProfit)) {
    throw new Error("تعذر التحقق من أرقام الملخص المالي السحابي.");
  }
  return { totalRevenue, totalProfit };
}

export async function subscribeToExpenseChanges(onChange: () => void): Promise<() => Promise<unknown>> {
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`expense-changes-${shopId}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_change_events", filter: `shop_id=eq.${shopId}` }, payload => {
      const row = payload.new;
      if (row && (row.entity_type === "expenses" || row.entity_type === "invoices" || row.entity_type === "invoice_items")) onChange();
    })
    .subscribe();
  return async () => { await supabase.removeChannel(channel); };
}
