import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

type BankCheckRow = Database["public"]["Tables"]["bank_checks"]["Row"];
type DeferredCheckRow = Database["public"]["Tables"]["deferred_check_records"]["Row"];

export type BankCheckStatus = "معلق" | "مسحوب" | "ملغي" | "مرتجع";
export type BankCheckDirection = "صادر" | "وارد";
export type CloudBankCheck = {
  id: string;
  version: number;
  checkNumber: string;
  amount: number;
  issueDate: string;
  dueDate: string;
  bankName: string;
  accountHolder: string;
  status: BankCheckStatus;
  type: BankCheckDirection;
  notes: string;
  createdAt: string;
};
export type BankCheckInput = Omit<CloudBankCheck, "id" | "version" | "createdAt">;
export type CloudDeferredCheck = {
  id: string;
  customerName: string;
  employeeName: string;
  productsList: string;
  invoiceNumber: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  createdAt: string;
};
export type DeferredCheckInput = Omit<CloudDeferredCheck, "id" | "remainingAmount" | "createdAt">;

const statusToDb: Record<BankCheckStatus, BankCheckRow["status"]> = {
  "معلق": "pending",
  "مسحوب": "cleared",
  "ملغي": "cancelled",
  "مرتجع": "returned",
};
const statusFromDb: Record<BankCheckRow["status"], BankCheckStatus> = {
  pending: "معلق",
  cleared: "مسحوب",
  cancelled: "ملغي",
  returned: "مرتجع",
};

function fromBankCheck(row: BankCheckRow): CloudBankCheck {
  return {
    id: row.id,
    version: row.version,
    checkNumber: row.check_number,
    amount: Number(row.amount),
    issueDate: row.issue_date,
    dueDate: row.due_date,
    bankName: row.bank_name,
    accountHolder: row.account_holder,
    status: statusFromDb[row.status],
    type: row.direction === "outgoing" ? "صادر" : "وارد",
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function fromDeferredCheck(row: DeferredCheckRow): CloudDeferredCheck {
  return {
    id: row.id,
    customerName: row.customer_name,
    employeeName: row.employee_name,
    productsList: row.products_list,
    invoiceNumber: row.invoice_number,
    totalAmount: Number(row.total_amount),
    paidAmount: Number(row.paid_amount),
    remainingAmount: Number(row.remaining_amount),
    createdAt: row.created_at,
  };
}

export async function listCloudBankChecks(): Promise<CloudBankCheck[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().from("bank_checks").select("*").eq("shop_id", shopId).is("deleted_at", null).order("due_date").order("id");
  return (requireCloudResult(result) as BankCheckRow[]).map(fromBankCheck);
}

export async function saveCloudBankCheck(input: BankCheckInput, current?: Pick<CloudBankCheck, "id" | "version">): Promise<CloudBankCheck> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("save_bank_check", {
    p_shop_id: shopId,
    p_check_id: current?.id ?? null,
    p_expected_version: current?.version ?? null,
    p_payload: {
      check_number: input.checkNumber,
      amount: input.amount,
      issue_date: input.issueDate,
      due_date: input.dueDate,
      bank_name: input.bankName,
      account_holder: input.accountHolder,
      status: statusToDb[input.status],
      direction: input.type === "صادر" ? "outgoing" : "incoming",
      notes: input.notes,
    },
  });
  return fromBankCheck(requireCloudResult(result));
}

export async function deleteCloudBankCheck(check: Pick<CloudBankCheck, "id" | "version">): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("delete_bank_check", {
    p_shop_id: shopId,
    p_check_id: check.id,
    p_expected_version: check.version,
  });
  requireCloudResult(result);
}

export async function listCloudDeferredChecks(): Promise<CloudDeferredCheck[]> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().from("deferred_check_records").select("*").eq("shop_id", shopId).is("deleted_at", null).order("created_at", { ascending: false }).order("id", { ascending: false });
  return (requireCloudResult(result) as DeferredCheckRow[]).map(fromDeferredCheck);
}

export async function createCloudDeferredCheck(input: DeferredCheckInput): Promise<CloudDeferredCheck> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("create_deferred_check_record", {
    p_shop_id: shopId,
    p_payload: {
      customer_name: input.customerName,
      employee_name: input.employeeName,
      products_list: input.productsList,
      invoice_number: input.invoiceNumber,
      total_amount: input.totalAmount,
      paid_amount: input.paidAmount,
    },
  });
  return fromDeferredCheck(requireCloudResult(result));
}

export async function deleteCloudDeferredCheck(id: string): Promise<void> {
  assertCloudOnline();
  const { shopId } = await getActiveShopContext();
  const result = await getSupabaseClient().rpc("delete_deferred_check_record", { p_shop_id: shopId, p_record_id: id });
  if (!requireCloudResult(result)) throw new Error("لم يُعثر على القيد الآجل في هذا المتجر؛ لم يتغير السجل.");
}

export async function subscribeToCheckChanges(onChange: () => void): Promise<() => Promise<unknown>> {
  const { shopId } = await getActiveShopContext();
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel(`checks-changes-${shopId}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "shop_change_events", filter: `shop_id=eq.${shopId}` }, payload => {
      const row = payload.new;
      if (row && (row.entity_type === "bank_checks" || row.entity_type === "deferred_check_records")) onChange();
    })
    .subscribe();
  return async () => { await supabase.removeChannel(channel); };
}
