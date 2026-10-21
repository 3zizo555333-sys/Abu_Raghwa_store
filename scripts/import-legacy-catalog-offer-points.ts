import { createHash } from "node:crypto";
import { customerLoyalty } from "../drizzle/schema";
import { getDb } from "../server/db";
import { applySupabaseLoyaltyEvent, ensureSupabaseLoyaltyProfile, normalizeLoyaltyPhone } from "../server/supabaseLoyalty";

type LegacyTransaction = {
  id?: unknown;
  points?: unknown;
  source?: unknown;
  description?: unknown;
  orderId?: unknown;
  createdAt?: unknown;
};

const apply = process.argv.includes("--apply");
const keyHash = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");

async function main() {
  const db = await getDb();
  if (!db) throw new Error("DATABASE_URL is required to read the legacy MySQL wallet");
  const profiles = await db.select({
    customerCode: customerLoyalty.customerCode,
    phone: customerLoyalty.phone,
    name: customerLoyalty.name,
    transactionsJson: customerLoyalty.transactionsJson,
  }).from(customerLoyalty);

  const phoneCounts = new Map<string, number>();
  for (const row of profiles) {
    const phone = normalizeLoyaltyPhone(row.phone);
    if (phone) phoneCounts.set(phone, (phoneCounts.get(phone) || 0) + 1);
  }

  let eligible = 0;
  let imported = 0;
  let skippedNoPhone = 0;
  let skippedDuplicatePhone = 0;
  let skippedMalformed = 0;
  let skippedOtherSource = 0;
  const work: Array<{ customerCode: string; phone: string; name: string; transaction: LegacyTransaction; source: "catalog" | "offer"; points: number }> = [];

  for (const row of profiles) {
    const phone = normalizeLoyaltyPhone(row.phone);
    if (phone.length < 7 || phone.length > 20) { skippedNoPhone += 1; continue; }
    if ((phoneCounts.get(phone) || 0) > 1) { skippedDuplicatePhone += 1; continue; }
    let transactions: unknown;
    try { transactions = JSON.parse(row.transactionsJson || "[]"); } catch { skippedMalformed += 1; continue; }
    if (!Array.isArray(transactions)) { skippedMalformed += 1; continue; }
    for (const value of transactions) {
      const transaction = value && typeof value === "object" ? value as LegacyTransaction : {};
      const source = transaction.source;
      if (source !== "catalog" && source !== "offer") { skippedOtherSource += 1; continue; }
      const points = Math.trunc(Number(transaction.points) || 0);
      if (!transaction.id || !points) { skippedMalformed += 1; continue; }
      work.push({ customerCode: row.customerCode, phone, name: row.name || "عميل أبو رغوة", transaction, source, points });
      eligible += 1;
    }
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    candidateProfiles: profiles.length,
    eligibleTransactions: eligible,
    skippedNoPhone,
    skippedDuplicatePhone,
    skippedMalformed,
    skippedOtherSource,
  }, null, 2));
  if (!apply) {
    console.log("Dry-run only. Review the counts, configure DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SUPABASE_LOYALTY_SHOP_ID if needed, then rerun with --apply.");
    return;
  }

  for (const item of work) {
    await ensureSupabaseLoyaltyProfile({ phone: item.phone, name: item.name });
    const transactionId = String(item.transaction.id);
    const idempotencyKey = `legacy-mysql:${keyHash(item.customerCode, transactionId)}`;
    await applySupabaseLoyaltyEvent({
      phone: item.phone,
      name: item.name,
      pointsDelta: item.points,
      source: item.source,
      sourceId: String(item.transaction.orderId || transactionId).slice(0, 180),
      idempotencyKey,
      description: `ترحيل تاريخي: ${String(item.transaction.description || (item.source === "catalog" ? "نقاط كتالوج" : "نقاط عرض")).slice(0, 450)}`,
    });
    imported += 1;
  }

  console.log(JSON.stringify({ importedTransactions: imported, note: "Importer is idempotent by legacy customer code and transaction id. It intentionally imports catalog/offer entries only; cashier/sale records are excluded to avoid duplicating the already-central Supabase POS ledger." }, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "Legacy loyalty import failed");
  process.exitCode = 1;
});
