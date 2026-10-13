import { assertCloudOnline, getSupabaseClient, requireCloudResult } from "./client";
import { getActiveShopContext } from "./products";
import type { Database } from "./database.types";

type Tables = Database["public"]["Tables"];
type CreditAccountRow = Tables["shop_credit_accounts"]["Row"];
type CreditTransactionRow = Tables["shop_credit_transactions"]["Row"];
export type CreditEntryType = "opening" | "purchase" | "payment" | "return" | "adjustment";
export type CreditPartyType = "customer" | "supplier";
export type ShopCreditAccount = CreditAccountRow & { balance: number; transactions: CreditTransactionRow[] };

async function managerShopId() {
  const { shopId, role } = await getActiveShopContext();
  if (role !== "manager" && role !== "admin") throw new Error("إدارة حسابات الآجل والموردين متاحة للمدير فقط.");
  return shopId;
}

export async function listShopSuppliersForInvoices(): Promise<Array<Pick<CreditAccountRow, "id" | "name">>> {
  const { shopId, role } = await getActiveShopContext();
  if (!(["manager", "admin", "supervisor"] as string[]).includes(role)) throw new Error("قائمة الموردين متاحة للإدارة أو المشرف فقط.");
  const result = await getSupabaseClient().from("shop_credit_accounts").select("id,name").eq("shop_id", shopId).eq("party_type", "supplier").is("deleted_at", null).order("name").limit(1000);
  return requireCloudResult(result) as Array<Pick<CreditAccountRow, "id" | "name">>;
}

export async function importLegacyShopCreditAccounts(customers: unknown[], suppliers: unknown[]) {
  assertCloudOnline();
  const shopId = await managerShopId();
  const result = await getSupabaseClient().rpc("import_legacy_shop_credit_accounts", {
    p_shop_id: shopId,
    p_customers: customers as unknown as Database["public"]["Tables"]["shop_credit_accounts"]["Row"][],
    p_suppliers: suppliers as unknown as Database["public"]["Tables"]["shop_credit_accounts"]["Row"][],
  });
  return requireCloudResult(result) as { imported: boolean; reason?: string; accounts?: number; transactions?: number };
}

export async function listShopCreditAccounts(partyType: CreditPartyType): Promise<ShopCreditAccount[]> {
  const shopId = await managerShopId();
  const client = getSupabaseClient();
  const [accountsResult, entriesResult] = await Promise.all([
    client.from("shop_credit_accounts").select("*").eq("shop_id", shopId).eq("party_type", partyType).is("deleted_at", null).order("name").limit(1000),
    client.from("shop_credit_transactions").select("*").eq("shop_id", shopId).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(10000),
  ]);
  const accounts = requireCloudResult(accountsResult) as CreditAccountRow[];
  const entries = requireCloudResult(entriesResult) as CreditTransactionRow[];
  const byAccount = new Map<string, CreditTransactionRow[]>();
  for (const entry of entries) {
    const list = byAccount.get(entry.account_id) ?? [];
    list.push(entry);
    byAccount.set(entry.account_id, list);
  }
  return accounts.map(account => {
    const transactions = byAccount.get(account.id) ?? [];
    const balance = transactions.reduce((sum, transaction) => sum + Number(transaction.balance_delta), 0);
    return { ...account, balance, transactions };
  });
}

export async function createShopCreditAccount(input: {
  partyType: CreditPartyType; name: string; phone?: string; notes?: string;
  initialBalance?: number; initialDescription?: string;
}) {
  assertCloudOnline();
  const shopId = await managerShopId();
  const result = await getSupabaseClient().rpc("create_shop_credit_account", {
    p_shop_id: shopId,
    p_party_type: input.partyType,
    p_name: input.name.trim(),
    p_phone: input.phone?.trim() ?? "",
    p_notes: input.notes?.trim() ?? "",
    p_initial_balance: input.initialBalance ?? 0,
    p_initial_description: input.initialDescription?.trim() || "رصيد افتتاحي",
  });
  return requireCloudResult(result) as { account: CreditAccountRow; opening: CreditTransactionRow | null };
}

export async function appendShopCreditTransaction(input: {
  accountId: string; type: Exclude<CreditEntryType, "opening">; amount: number; balanceDelta: number;
  description: string; notes?: string; occurredAt?: string;
}) {
  assertCloudOnline();
  const shopId = await managerShopId();
  const result = await getSupabaseClient().rpc("append_shop_credit_transaction", {
    p_shop_id: shopId,
    p_account_id: input.accountId,
    p_entry_type: input.type,
    p_amount: input.amount,
    p_balance_delta: input.balanceDelta,
    p_description: input.description.trim(),
    p_notes: input.notes?.trim() ?? "",
    p_occurred_at: input.occurredAt ?? new Date().toISOString(),
  });
  return requireCloudResult(result) as CreditTransactionRow;
}

export async function softDeleteShopCreditAccount(accountId: string) {
  assertCloudOnline();
  const shopId = await managerShopId();
  const result = await getSupabaseClient().from("shop_credit_accounts").update({ deleted_at: new Date().toISOString() }).eq("id", accountId).eq("shop_id", shopId).select("id").single();
  return requireCloudResult(result);
}

export async function subscribeToShopCredits(onChange: () => void) {
  const shopId = await managerShopId();
  const client = getSupabaseClient();
  const channel = client.channel(`shop-credits-${shopId}-${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "shop_credit_accounts", filter: `shop_id=eq.${shopId}` }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "shop_credit_transactions", filter: `shop_id=eq.${shopId}` }, onChange)
    .subscribe();
  return async () => { await client.removeChannel(channel); };
}
