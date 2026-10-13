import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

type ExpenseRow = Database["public"]["Tables"]["expenses"]["Row"];
type InvoiceRow = { id: string; total: number | string };
type InvoiceCostRow = { id: string; invoice_id: string; quantity: number | string; unit_cost_snapshot: number | string };

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
export type ExpenseSummary = {
  totalRevenue: number;
  totalExpenses: number;
  totalProfit: number;
  netProfit: number;
};

const PAGE_SIZE = 1000;
const INVOICE_BATCH_SIZE = 200;

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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

export function calculateExpenseSummaryFallback(
  invoices: Array<Pick<InvoiceRow, "total">>,
  invoiceItems: Array<Pick<InvoiceCostRow, "quantity" | "unit_cost_snapshot">>,
  expenses: Array<Pick<CloudExpense, "amount">>,
): ExpenseSummary {
  const totalRevenue = invoices.reduce((sum, invoice) => sum + finiteNumber(invoice.total), 0);
  const costOfGoods = invoiceItems.reduce(
    (sum, item) => sum + finiteNumber(item.quantity) * finiteNumber(item.unit_cost_snapshot),
    0,
  );
  const totalExpenses = expenses.reduce((sum, expense) => sum + finiteNumber(expense.amount), 0);
  const totalProfit = totalRevenue - costOfGoods;
  return { totalRevenue, totalExpenses, totalProfit, netProfit: totalProfit - totalExpenses };
}

export async function listCloudExpenses(): Promise<CloudExpense[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const rows: ExpenseRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from("expenses")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result) as ExpenseRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
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
  const totalExpenses = Number(summary.total_expenses);
  const totalProfit = Number(summary.total_profit);
  const netProfit = Number(summary.net_profit);
  if (![totalRevenue, totalExpenses, totalProfit, netProfit].every(Number.isFinite)) {
    throw new Error("تعذر التحقق من أرقام الملخص المالي السحابي.");
  }
  return { totalRevenue, totalExpenses, totalProfit, netProfit };
}

/** Reconstructs the same summary from shop-scoped read-only rows when the RPC is unavailable. */
export async function getCloudExpenseSummaryFallback(expenses: CloudExpense[]): Promise<ExpenseSummary> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const invoices: InvoiceRow[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await supabase
      .from("invoices")
      .select("id,total")
      .eq("shop_id", shopId)
      .eq("status", "completed")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result) as InvoiceRow[];
    invoices.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  const invoiceItems: InvoiceCostRow[] = [];
  const invoiceIds = invoices.map(invoice => invoice.id);
  for (let batchStart = 0; batchStart < invoiceIds.length; batchStart += INVOICE_BATCH_SIZE) {
    const invoiceIdBatch = invoiceIds.slice(batchStart, batchStart + INVOICE_BATCH_SIZE);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const result = await supabase
        .from("invoice_items")
        .select("id,invoice_id,quantity,unit_cost_snapshot")
        .eq("shop_id", shopId)
        .in("invoice_id", invoiceIdBatch)
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      const page = requireCloudResult(result) as InvoiceCostRow[];
      invoiceItems.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
  }
  return calculateExpenseSummaryFallback(invoices, invoiceItems, expenses);
}

export async function subscribeToExpenseChanges(onChange: () => void): Promise<() => Promise<unknown>> {
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`expense-changes-${shopId}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_change_events", filter: `shop_id=eq.${shopId}` }, payload => {
      const row = payload.new;
      if (row && (row.entity_type === "expenses" || row.entity_type === "invoices" || row.entity_type === "invoice_items" || row.entity_type === "shop_feature_images")) onChange();
    })
    .subscribe();
  return async () => { await supabase.removeChannel(channel); };
}
