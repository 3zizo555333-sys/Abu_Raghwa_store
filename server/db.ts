import { and, asc, desc, eq, gt, inArray, isNull, max, notInArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, InsertStaffAccount, users, staffAccounts, sharedOffers, globalAppSettings, cloudAppRecords, cloudAppBackups, catalogOrders, offerPurchaseRequests } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getOfferEndAt } from "../client/src/lib/offerExpiry";
import { mergeSharedOfferRecords, removeOfferFromLegacyData } from "./sharedOffers";
import { applySupabaseLoyaltyEvent, ensureSupabaseLoyaltyProfile, getSupabaseLoyaltyProfile, listSupabaseLoyaltyProfiles, type SupabaseLoyaltyTransaction } from "./supabaseLoyalty";

export type { InsertStaffAccount } from "../drizzle/schema";
export type UpdateStaffAccount = Partial<InsertStaffAccount>;

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

function requireDb(db: Awaited<ReturnType<typeof getDb>>) {
  if (!db) throw new Error("قاعدة البيانات غير متاحة الآن؛ حاول مرة أخرى بعد لحظات");
  return db;
}

export async function getStaffAccounts() {
  const db = requireDb(await getDb());
  return db.select().from(staffAccounts).orderBy(asc(staffAccounts.createdAt));
}

export async function insertStaffAccount(account: InsertStaffAccount) {
  const db = requireDb(await getDb());
  await db.insert(staffAccounts).values(account);
}

export async function updateStaffAccount(email: string, changes: Partial<InsertStaffAccount>) {
  const db = requireDb(await getDb());
  await db.update(staffAccounts).set(changes).where(eq(staffAccounts.email, email));
}

export async function deleteStaffAccount(email: string) {
  const db = requireDb(await getDb());
  await db.delete(staffAccounts).where(eq(staffAccounts.email, email));
}

export async function importStaffAccounts(accounts: InsertStaffAccount[]) {
  if (!accounts.length) return;
  const db = requireDb(await getDb());
  await db.insert(staffAccounts).values(accounts).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
}

export async function saveSharedOffer(id: string, offerData: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(sharedOffers).values({ id, offerData }).onDuplicateKeyUpdate({
    set: { offerData }
  });
}

export async function getSharedOffer(id: string) {
  const db = await getDb();
  if (!db) return null;
  const res = await db.select().from(sharedOffers).where(eq(sharedOffers.id, id)).limit(1);
  return res.length > 0 ? res[0] : null;
}

export async function listSharedOffers() {
  const db = await getDb();
  if (!db) return null;

  const rows = await db.select().from(sharedOffers).orderBy(desc(sharedOffers.createdAt));
  const legacy = await getGlobalAppSetting("abu_raghwa_saved_offers");
  return mergeSharedOfferRecords(legacy?.dataJson || null, rows.map(row => row.offerData));
}

export async function deleteSharedOffer(id: string) {
  const db = await getDb();
  if (!db) return;
  await db.delete(sharedOffers).where(eq(sharedOffers.id, id));

  // Old versions kept an array snapshot; remove only this offer so it cannot
  // reappear after the manager explicitly deletes its individual cloud row.
  const legacy = await getGlobalAppSetting("abu_raghwa_saved_offers");
  if (legacy) {
    const updated = removeOfferFromLegacyData(legacy.dataJson, id);
    if (updated.changed && updated.dataJson === "[]") {
      try {
        await db.delete(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, "abu_raghwa_saved_offers"));
      } catch (error) {
        if (!isMissingCloudTableError(error)) throw error;
      }
      await db.delete(globalAppSettings).where(eq(globalAppSettings.key, "abu_raghwa_saved_offers"));
    } else if (updated.changed) {
      await setGlobalAppSetting("abu_raghwa_saved_offers", updated.dataJson);
    }
  }
}

function isMissingCloudTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ER_NO_SUCH_TABLE|doesn't exist|does not exist|unknown table/i.test(message);
}

export const CLOUD_RECORD_BATCH_SIZE = 500;

export function splitIntoBatches<T>(items: T[], batchSize = CLOUD_RECORD_BATCH_SIZE) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    batches.push(items.slice(index, index + batchSize));
  }
  return batches;
}

async function rejectAccidentalEmptyCollectionWrite(db: Awaited<ReturnType<typeof getDb>>, key: string, parsed: unknown) {
  if (!db || !Array.isArray(parsed) || parsed.length > 0) return;
  try {
    const existing = await db.select({ recordId: cloudAppRecords.recordId }).from(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key)).limit(1);
    if (existing.length) throw new Error(`حماية البيانات: رُفض مسح مجموعة ${key} ببيانات فارغة`);
  } catch (error) {
    if (!isMissingCloudTableError(error)) throw error;
    const legacy = await db.select({ dataJson: globalAppSettings.dataJson }).from(globalAppSettings).where(eq(globalAppSettings.key, key)).limit(1);
    if (legacy[0]) {
      const previous = JSON.parse(legacy[0].dataJson) as unknown;
      if (Array.isArray(previous) && previous.length > 0) throw new Error(`حماية البيانات: رُفض مسح مجموعة ${key} ببيانات فارغة`);
    }
  }
}

export async function setGlobalAppSetting(key: string, dataJson: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لحفظ بيانات الحساب الآن");
  let parsed: unknown;
  try { parsed = JSON.parse(dataJson); } catch { parsed = undefined; }
  await rejectAccidentalEmptyCollectionWrite(db, key, parsed);
  if (Array.isArray(parsed)) {
    const records = parsed.map((item, index) => {
      const value: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : { value: item };
      const rawId = value.id ?? value.key ?? value.code ?? `${index}`;
      return { collectionKey: key, recordId: String(rawId), position: index, dataJson: JSON.stringify(item) };
    });
    try {
      await db.transaction(async tx => {
        const existingRecords = await tx.select().from(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key)).orderBy(asc(cloudAppRecords.position));
        if (existingRecords.length) {
          await tx.insert(cloudAppBackups).values({ collectionKey: key, dataJson: JSON.stringify(existingRecords.map(record => JSON.parse(record.dataJson))) });
          const backups = await tx.select({ id: cloudAppBackups.id }).from(cloudAppBackups).where(eq(cloudAppBackups.collectionKey, key)).orderBy(desc(cloudAppBackups.createdAt));
          const expiredBackupIds = backups.slice(20).map(backup => backup.id);
          if (expiredBackupIds.length) await tx.delete(cloudAppBackups).where(inArray(cloudAppBackups.id, expiredBackupIds));
        }
        // A 10,000-product import must not issue 10,000 sequential INSERTs.
        // Multi-row batches keep the transaction durable while staying below
        // MySQL packet and parameter limits, so the request completes before
        // the WebDev request timeout and every device sees the same collection.
        for (const batch of splitIntoBatches(records)) {
          await tx.insert(cloudAppRecords).values(batch).onDuplicateKeyUpdate({
            set: {
              position: sql`VALUES(${cloudAppRecords.position})`,
              dataJson: sql`VALUES(${cloudAppRecords.dataJson})`,
            },
          });
        }
        const ids = records.map(record => record.recordId);
        if (ids.length) await tx.delete(cloudAppRecords).where(and(eq(cloudAppRecords.collectionKey, key), notInArray(cloudAppRecords.recordId, ids)));
        else await tx.delete(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key));
      });
    } catch (error) {
      // Older WebDev databases may not have received the collection migration yet.
      // Keep writes durable in the legacy table instead of reporting a false success.
      if (!isMissingCloudTableError(error)) throw error;
      await db.insert(globalAppSettings).values({ key, dataJson }).onDuplicateKeyUpdate({ set: { dataJson } });
    }
    return;
  }
  await db.insert(globalAppSettings).values({ key, dataJson }).onDuplicateKeyUpdate({ set: { dataJson } });
}

/**
 * Merge one bounded page into a large shared collection. Unlike the full
 * replacement writer, this intentionally never deletes rows: an older phone
 * with only the first 881 products cannot erase a newer 10,000-product import.
 */
export async function mergeGlobalAppSettingChunk(key: string, dataJson: string, offset = 0) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لحفظ المنتجات الآن");
  const parsed = JSON.parse(dataJson);
  if (!Array.isArray(parsed) || parsed.length > CLOUD_RECORD_BATCH_SIZE) throw new Error("دفعة المنتجات غير صالحة");
  const existing = await db.select({ recordId: cloudAppRecords.recordId, position: cloudAppRecords.position })
    .from(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key));
  const positions = new Map(existing.map(record => [record.recordId, record.position]));
  let nextPosition = existing.reduce((maxPosition, record) => Math.max(maxPosition, record.position), -1) + 1;
  const records = parsed.map((item, index) => {
    const value: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : { value: item };
    const rawId = value.id ?? value.key ?? value.code;
    if (rawId === undefined || rawId === null || String(rawId).trim() === "") throw new Error("كل منتج يجب أن يملك معرّفًا");
    const recordId = String(rawId);
    return { collectionKey: key, recordId, position: positions.get(recordId) ?? nextPosition++, dataJson: JSON.stringify(item) };
  });
  try {
    for (const batch of splitIntoBatches(records)) {
      await db.insert(cloudAppRecords).values(batch).onDuplicateKeyUpdate({
        set: { position: sql`VALUES(${cloudAppRecords.position})`, dataJson: sql`VALUES(${cloudAppRecords.dataJson})` },
      });
    }
  } catch (error) {
    if (!isMissingCloudTableError(error)) throw error;
    const current = await getGlobalAppSetting(key);
    const existing = current ? parseJsonArray<Record<string, unknown>>(current.dataJson) : [];
    const byId = new Map(existing.map(item => [String(item.id ?? item.key ?? item.code), item]));
    for (const item of parsed) byId.set(String(item.id ?? item.key ?? item.code), item);
    const merged = Array.from(byId.values());
    await db.insert(globalAppSettings).values({ key, dataJson: JSON.stringify(merged) }).onDuplicateKeyUpdate({ set: { dataJson: JSON.stringify(merged) } });
  }
}

/**
 * Atomically apply one complete catalog snapshot. Existing IDs keep their
 * server position, genuinely new IDs are appended, and IDs omitted from the
 * authoritative snapshot are deleted in the same transaction. This prevents
 * deleted products from returning after a reload while avoiding half-written
 * catalogs.
 */
const jsonValuesEqual = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

function mergeProductSnapshots(current: Record<string, unknown>[], incoming: Record<string, unknown>[], base?: Record<string, unknown>[]) {
  if (!base) return incoming;
  const byId = (items: Record<string, unknown>[]) => new Map(items.map(item => [String(item.id ?? item.key ?? item.code), item]));
  const currentById = byId(current);
  const incomingById = byId(incoming);
  const baseById = byId(base);
  const orderedIds = Array.from(new Set([
    ...incoming.map(item => String(item.id ?? item.key ?? item.code)),
    ...current.map(item => String(item.id ?? item.key ?? item.code)),
  ]));
  const merged: Record<string, unknown>[] = [];
  for (const id of orderedIds) {
    const currentItem = currentById.get(id);
    const incomingItem = incomingById.get(id);
    const baseItem = baseById.get(id);
    let selected: Record<string, unknown> | undefined;
    if (!baseItem) {
      // A record created on either device is preserved when the other device
      // submits an older snapshot that has never seen it.
      selected = incomingItem || currentItem;
    } else if (!incomingItem) {
      // An omission is a real deletion only when the server copy was still
      // equal to the device's base. Otherwise a newer remote edit wins.
      selected = currentItem && !jsonValuesEqual(currentItem, baseItem) ? currentItem : undefined;
    } else if (!currentItem) {
      // Preserve a local edit even if another device deleted the old copy.
      selected = !jsonValuesEqual(incomingItem, baseItem) ? incomingItem : undefined;
    } else if (jsonValuesEqual(incomingItem, baseItem)) {
      selected = currentItem;
    } else if (jsonValuesEqual(currentItem, baseItem)) {
      selected = incomingItem;
    } else if (typeof currentItem === "object" && typeof incomingItem === "object") {
      selected = { ...currentItem, ...incomingItem };
    } else {
      selected = incomingItem;
    }
    if (selected) merged.push(selected);
  }
  return merged;
}

export async function mergeGlobalAppSettingSnapshot(key: string, dataJson: string, baseDataJson?: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لحفظ المنتجات الآن");
  const parsed = JSON.parse(dataJson);
  if (!Array.isArray(parsed)) throw new Error("كتالوج المنتجات غير صالح");
  let base: Record<string, unknown>[] | undefined;
  if (baseDataJson) {
    try {
      const parsedBase = JSON.parse(baseDataJson);
      if (Array.isArray(parsedBase)) base = parsedBase as Record<string, unknown>[];
    } catch { /* ignore an optional stale base and keep the incoming snapshot */ }
  }
  await rejectAccidentalEmptyCollectionWrite(db, key, parsed);
  try {
    await db.transaction(async tx => {
      const existingRows = await tx.select().from(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key));
      const existing = existingRows.map(row => ({ recordId: row.recordId, position: row.position }));
      const effectiveParsed = key === "abu_raghwa_products"
        ? mergeProductSnapshots(existingRows.map(row => JSON.parse(row.dataJson) as Record<string, unknown>), parsed as Record<string, unknown>[], base)
        : parsed;
      const positions = new Map(existing.map(record => [record.recordId, record.position]));
      let nextPosition = existing.reduce((maxPosition, record) => Math.max(maxPosition, record.position), -1) + 1;
      const records = effectiveParsed.map(item => {
        const value: Record<string, unknown> = item && typeof item === "object" ? item as Record<string, unknown> : { value: item };
        const rawId = value.id ?? value.key ?? value.code;
        if (rawId === undefined || rawId === null || String(rawId).trim() === "") throw new Error("كل منتج يجب أن يملك معرّفًا");
        const recordId = String(rawId);
        const position = positions.get(recordId) ?? nextPosition++;
        return { collectionKey: key, recordId, position, dataJson: JSON.stringify(item) };
      });
      for (const batch of splitIntoBatches(records)) {
        await tx.insert(cloudAppRecords).values(batch).onDuplicateKeyUpdate({
          set: { dataJson: sql`VALUES(${cloudAppRecords.dataJson})` },
        });
      }
      const incomingIds = records.map(record => record.recordId);
      if (incomingIds.length > 0) {
        await tx.delete(cloudAppRecords).where(and(
          eq(cloudAppRecords.collectionKey, key),
          notInArray(cloudAppRecords.recordId, incomingIds),
        ));
      } else {
        await tx.delete(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key));
      }
    });
  } catch (error) {
    if (!isMissingCloudTableError(error)) throw error;
    // This function receives a complete authoritative snapshot. If an item is
    // absent, it was intentionally deleted and must not be resurrected by the
    // legacy settings fallback.
    await db.insert(globalAppSettings).values({ key, dataJson: JSON.stringify(parsed) }).onDuplicateKeyUpdate({ set: { dataJson: JSON.stringify(parsed) } });
  }
}

export async function normalizeCloudCollectionPositions(key: string) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لإعادة ترتيب المنتجات الآن");
  const records = await db.select({ recordId: cloudAppRecords.recordId }).from(cloudAppRecords)
    .where(eq(cloudAppRecords.collectionKey, key)).orderBy(asc(cloudAppRecords.position), asc(cloudAppRecords.recordId));
  await db.transaction(async tx => {
    for (const [position, record] of Array.from(records.entries())) {
      await tx.update(cloudAppRecords).set({ position }).where(and(eq(cloudAppRecords.collectionKey, key), eq(cloudAppRecords.recordId, record.recordId)));
    }
  });
  return records.length;
}

export async function restoreCloudBackup(key: string, backupId?: number) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة للاستعادة الآن");
  const backups = await db.select().from(cloudAppBackups).where(backupId === undefined ? eq(cloudAppBackups.collectionKey, key) : and(eq(cloudAppBackups.collectionKey, key), eq(cloudAppBackups.id, backupId))).orderBy(desc(cloudAppBackups.createdAt)).limit(1);
  const backup = backups[0];
  if (!backup) throw new Error("لا توجد نسخة احتياطية لهذه البيانات");
  const parsed = JSON.parse(backup.dataJson);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("النسخة الاحتياطية فارغة أو غير صالحة");
  await setGlobalAppSetting(key, JSON.stringify(parsed));
  return { restored: parsed.length, backupId: backup.id, createdAt: backup.createdAt };
}

export async function getGlobalAppSetting(key: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const records = await db.select().from(cloudAppRecords).where(eq(cloudAppRecords.collectionKey, key)).orderBy(asc(cloudAppRecords.position));
    if (records.length) return { key, dataJson: JSON.stringify(records.map(record => JSON.parse(record.dataJson))), updatedAt: records[0].updatedAt };
  } catch (error) {
    if (!isMissingCloudTableError(error)) throw error;
  }
  const res = await db.select().from(globalAppSettings).where(eq(globalAppSettings.key, key)).limit(1);
  if (!res.length) return null;
  // Lazy migration: the next read of a legacy array materializes item rows.
  try {
    const parsed = JSON.parse(res[0].dataJson);
    if (Array.isArray(parsed)) await setGlobalAppSetting(key, res[0].dataJson);
  } catch { /* preserve malformed legacy data for the caller */ }
  return res[0];
}

export async function getPublicLoyaltyRewardLevels() {
  const setting = await getGlobalAppSetting("abu_reward_levels");
  if (!setting) return null;
  try {
    const parsed = JSON.parse(setting.dataJson);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((level): level is { points: number; giftName: string; confirmed: true } =>
        level && level.confirmed === true && Number.isSafeInteger(Number(level.points)) && Number(level.points) > 0 && typeof level.giftName === "string" && Boolean(level.giftName.trim()))
      .map(level => ({ points: Number(level.points), giftName: level.giftName.trim(), confirmed: true as const }))
      .sort((first, second) => first.points - second.points);
  } catch {
    return null;
  }
}


export type CloudCollectionCursor = { position: number; recordId: string };

export async function getGlobalAppSettingChunk(key: string, offset = 0, limit = CLOUD_RECORD_BATCH_SIZE, after?: CloudCollectionCursor) {
  const db = await getDb();
  if (!db) return { items: [] as unknown[], nextOffset: null as number | null, nextCursor: null as CloudCollectionCursor | null, hasMore: false, total: 0, updatedAt: null as string | null };
  try {
    // Count, revision, and page are read in one transaction. The second
    // cursor makes the order deterministic even when rows are deleted or
    // inserted between requests; OFFSET alone can skip the last product.
    const [revision, totalRows, records] = await db.transaction(async tx => {
      const collectionWhere = after
        ? and(
          eq(cloudAppRecords.collectionKey, key),
          or(
            gt(cloudAppRecords.position, after.position),
            and(eq(cloudAppRecords.position, after.position), gt(cloudAppRecords.recordId, after.recordId)),
          ),
        )
        : eq(cloudAppRecords.collectionKey, key);
      const allCollection = eq(cloudAppRecords.collectionKey, key);
      const revisionRows = await tx.select({ updatedAt: max(cloudAppRecords.updatedAt) }).from(cloudAppRecords).where(allCollection);
      const totalRowsResult = await tx.select({ total: sql<number>`count(*)` }).from(cloudAppRecords).where(allCollection);
      const pageRows = await tx.select().from(cloudAppRecords)
        .where(collectionWhere)
        .orderBy(asc(cloudAppRecords.position), asc(cloudAppRecords.recordId))
        .limit(limit + 1)
        .offset(after ? 0 : offset);
      return [revisionRows, totalRowsResult, pageRows] as const;
    });
    const total = Number(totalRows[0]?.total || 0);
    if (records.length) {
      const hasMore = records.length > limit;
      const delivered = records.slice(0, limit);
      const last = delivered[delivered.length - 1];
      return {
        items: delivered.map(record => JSON.parse(record.dataJson) as unknown),
        nextOffset: hasMore ? offset + limit : null,
        nextCursor: last ? { position: last.position, recordId: last.recordId } : null,
        hasMore,
        total,
        updatedAt: revision[0]?.updatedAt?.toISOString() ?? null,
      };
    }
  } catch (error) {
    if (!isMissingCloudTableError(error)) throw error;
  }
  const legacy = await db.select().from(globalAppSettings).where(eq(globalAppSettings.key, key)).limit(1);
  if (!legacy.length) return { items: [] as unknown[], nextOffset: null as number | null, nextCursor: null as CloudCollectionCursor | null, hasMore: false, total: 0, updatedAt: null as string | null };
  try {
    const parsed = JSON.parse(legacy[0].dataJson);
    if (Array.isArray(parsed)) {
      const items = parsed.slice(offset, offset + limit);
      return {
        items,
        nextOffset: offset + items.length < parsed.length ? offset + items.length : null,
        nextCursor: null,
        hasMore: offset + items.length < parsed.length,
        total: parsed.length,
        updatedAt: legacy[0].updatedAt?.toISOString() ?? null,
      };
    }
  } catch { /* preserve malformed legacy data for the regular reader */ }
  return { items: [], nextOffset: null as number | null, nextCursor: null as CloudCollectionCursor | null, hasMore: false, total: 0, updatedAt: legacy[0].updatedAt?.toISOString() ?? null };
}

export type CatalogOrderInput = {
  id: string;
  customerName: string;
  customerPhone: string;
  customerCode?: string;
  address?: string;
  note?: string;
  itemsJson: string;
  totalAmount: number;
  fulfillmentMethod?: "pickup" | "delivery";
  priceAdjustmentPercent?: number;
};

export async function createCatalogOrder(order: CatalogOrderInput) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لتسجيل الطلب الآن");
  const orderItems = parseJsonArray<{ productId?: unknown; name?: unknown; unit?: unknown; price?: unknown; quantity?: unknown; loyaltyPoints?: unknown }>(order.itemsJson);
  if (!orderItems.length || orderItems.length > 100) throw new Error("يجب أن يحتوي الطلب على صنف واحد إلى 100 صنف.");
  const computedTotal = orderItems.reduce((sum, item) => {
    const price = Number(item.price);
    const quantity = Number(item.quantity);
    if (typeof item.name !== "string" || !item.name.trim() || !Number.isFinite(price) || price < 0 || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) {
      throw new Error("تحتوي العربة على بيانات منتج أو كمية غير صالحة.");
    }
    return sum + price * quantity;
  }, 0);
  if (!Number.isFinite(order.totalAmount) || order.totalAmount < 0 || Math.abs(computedTotal - order.totalAmount) > 0.01) {
    throw new Error("إجمالي الطلب لا يطابق بنود العربة.");
  }

  // Persist the order before any customer/loyalty side effect. Reusing the
  // same client-generated ID makes a retry safe when the first response was lost.
  await db.insert(catalogOrders).values({
    ...order,
    customerCode: null,
    address: order.address || null,
    note: order.note || null,
    itemsJson: JSON.stringify(orderItems),
    totalAmount: computedTotal,
    fulfillmentMethod: order.fulfillmentMethod || "pickup",
    priceAdjustmentPercent: Number(order.priceAdjustmentPercent || 0),
  }).onDuplicateKeyUpdate({ set: { id: order.id } });

  let customerCode: string | null = null;
  try {
    const profile = await ensureSupabaseLoyaltyProfile({ name: order.customerName, phone: order.customerPhone, customerCode: order.customerCode });
    customerCode = profile?.customer_code || null;
    if (customerCode) await db.update(catalogOrders).set({ customerCode }).where(eq(catalogOrders.id, order.id));
  } catch (error) {
    console.warn("[Catalog] Order saved; customer loyalty setup will need retry", {
      orderId: order.id,
      reason: error instanceof Error ? error.message : "unknown loyalty error",
    });
  }
  return { customerCode };
}

export async function listCatalogOrders(options: { includeArchived?: boolean } = {}) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(catalogOrders);
  return (options.includeArchived ? query : query.where(isNull(catalogOrders.archivedAt))).orderBy(desc(catalogOrders.createdAt));
}

export async function archiveCatalogOrder(id: string) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لأرشفة الطلب الآن");
  const rows = await database.select().from(catalogOrders).where(eq(catalogOrders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new Error("الطلب غير موجود");
  if (order.archivedAt) return { success: true as const, pointsReversed: Number(order.archivedPointsReversed || 0) };
  const archivedAt = new Date();
  const earned = order.status === "delivered" ? Math.max(0, Math.trunc(Number(order.loyaltyPointsAwarded) || 0)) : 0;
  let pointsReversed = 0;
  if (earned > 0) {
    const event = await applySupabaseLoyaltyEvent({ phone: order.customerPhone, name: order.customerName, pointsDelta: -earned, source: "catalog", sourceId: order.id, idempotencyKey: `catalog-order:${order.id}:archive:${new Date(order.updatedAt).getTime()}`, description: `عكس ${earned} نقطة عند أرشفة الطلب #${order.id.slice(-6).toUpperCase()}` });
    pointsReversed = Math.abs(Number(event.points_delta) || 0);
  }
  await database.update(catalogOrders).set({ archivedAt, archivedPointsReversed: pointsReversed }).where(eq(catalogOrders.id, id));
  return { success: true as const, pointsReversed };
}

export async function restoreCatalogOrder(id: string) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لاستعادة الطلب الآن");
  const rows = await database.select().from(catalogOrders).where(eq(catalogOrders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new Error("الطلب غير موجود");
  if (!order.archivedAt) return { success: true as const, pointsRestored: 0 };
  const points = Math.max(0, Math.trunc(Number(order.archivedPointsReversed) || 0));
  if (points > 0) {
    await applySupabaseLoyaltyEvent({ phone: order.customerPhone, name: order.customerName, pointsDelta: points, source: "catalog", sourceId: order.id, idempotencyKey: `catalog-order:${order.id}:restore:${new Date(order.archivedAt).getTime()}`, description: `استعادة ${points} نقطة بعد استعادة الطلب #${order.id.slice(-6).toUpperCase()}` });
  }
  await database.update(catalogOrders).set({ archivedAt: null, archivedPointsReversed: 0 }).where(eq(catalogOrders.id, id));
  return { success: true as const, pointsRestored: points };
}

export async function deleteCatalogOrder(id: string) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لحذف الطلب الآن");
  const rows = await database.select().from(catalogOrders).where(eq(catalogOrders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new Error("الطلب غير موجود");
  if (!order.archivedAt) throw new Error("يجب أرشفة الطلب قبل حذفه نهائيًا");
  await database.delete(catalogOrders).where(eq(catalogOrders.id, id));
  return { success: true as const, loyaltyPointsReversed: Number(order.archivedPointsReversed || 0) };
}

export type CatalogOrderStatus = "new" | "contacted" | "confirmed" | "preparing" | "delivered" | "cancelled";

export type LoyaltyTransaction = SupabaseLoyaltyTransaction;

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function normalizeCustomerPhone(phone?: string | null) {
  return String(phone || "").trim().replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[\s-]/g, "");
}

type LoyaltyIdentifier = string | { phone?: string | null; customerCode?: string | null };

export async function registerOfferCustomer(input: { name: string; phone?: string; customerCode?: string; referralPhone?: string }) {
  const profileRow = await ensureSupabaseLoyaltyProfile({ name: input.name, phone: input.phone || "", customerCode: input.customerCode });
  if (profileRow.created && input.referralPhone?.trim()) {
    const referrer = await getSupabaseLoyaltyProfile({ phone: input.referralPhone });
    if (referrer && normalizeCustomerPhone(referrer.phone) !== normalizeCustomerPhone(profileRow.phone)) {
      await applySupabaseLoyaltyEvent({
        phone: referrer.phone, name: referrer.name, pointsDelta: 50, source: "referral",
        sourceId: profileRow.customer_code, idempotencyKey: `referral:${referrer.customerCode}:${profileRow.customer_code}`,
        description: `مكافأة دعوة الصديق (${profileRow.full_name})`,
      });
    }
  }
  return getSupabaseLoyaltyProfile({ customerCode: profileRow.customer_code });
}
export async function manuallyAwardReferralPoints(input: { phone?: string; customerCode?: string; friendName: string; points?: number }) {
  const existing = await getSupabaseLoyaltyProfile({ phone: input.phone, customerCode: input.customerCode });
  if (!existing) throw new Error("العميل غير مسجل في دفتر الولاء");
  const points = Math.max(1, Math.trunc(Number(input.points) || 50));
  const event = await applySupabaseLoyaltyEvent({ phone: existing.phone, name: existing.name, pointsDelta: points, source: "referral", sourceId: input.friendName.trim().slice(0, 160), idempotencyKey: `manual-referral:${randomUUID()}`, description: `مكافأة دعوة الصديق (${input.friendName.trim() || "صديق جديد"})` });
  return { profile: await getSupabaseLoyaltyProfile({ phone: existing.phone }), pointsAwarded: event.points_delta };
}

export async function createOfferPurchaseRequest(input: { offerId: string; customerCode: string; customerNote?: string }) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لتسجيل طلب العرض الآن");
  const offerRow = await getSharedOffer(input.offerId);
  if (!offerRow) throw new Error("هذا العرض غير موجود أو لم يُنشر بعد");

  let offer: Record<string, any>;
  try {
    offer = JSON.parse(offerRow.offerData);
  } catch {
    throw new Error("تعذر قراءة تفاصيل هذا العرض");
  }
  if (!offer || typeof offer !== "object" || offer.isActivated !== true || !Array.isArray(offer.items) || offer.items.length === 0) {
    throw new Error("هذا العرض غير متاح للشراء حاليًا");
  }
  const endAt = getOfferEndAt(offer);
  if (Number.isFinite(offer.startAt) && Number(offer.startAt) > Date.now()) throw new Error("لم يبدأ هذا العرض بعد");
  if (endAt && endAt <= Date.now()) throw new Error("انتهت صلاحية هذا العرض");
  const offerTitle = String(offer.title || "").trim();
  const offerPrice = Number(offer.offerPrice);
  if (!offerTitle || !Number.isFinite(offerPrice) || offerPrice < 0) throw new Error("بيانات سعر العرض غير صالحة");
  const offerPoints = Math.max(0, Math.trunc(Number(offer.loyaltyPoints) || 0));
  const offerSnapshot = JSON.stringify({
    id: input.offerId,
    title: offerTitle,
    strategyName: String(offer.strategyName || "عرض أبو رغوة"),
    items: offer.items.map((rawItem: unknown) => {
      const item = rawItem && typeof rawItem === "object" ? rawItem as Record<string, unknown> : {};
      return { name: String(item.name || ""), quantity: Math.max(1, Math.trunc(Number(item.quantity) || 1)), offerPrice: Math.max(0, Number(item.offerPrice) || 0) };
    }),
    offerPrice,
    loyaltyPoints: offerPoints,
    endAt: Number(offer.endAt) || null,
    endDate: String(offer.endDate || ""),
  });
  const customerCode = input.customerCode.trim().toUpperCase();

  return database.transaction(async tx => {
    const profile = await getSupabaseLoyaltyProfile({ customerCode });
    if (!profile) throw new Error("كود الولاء غير مسجل؛ سجّل بطاقة نقاطك أولًا");
    const existingRequests = await tx.select().from(offerPurchaseRequests).where(and(
      eq(offerPurchaseRequests.offerId, input.offerId),
      eq(offerPurchaseRequests.customerCode, profile.customerCode),
      eq(offerPurchaseRequests.status, "pending"),
    )).limit(1);
    if (existingRequests[0]) return { id: existingRequests[0].id, offerTitle: existingRequests[0].offerTitle, status: existingRequests[0].status, loyaltyPointsAwarded: Number(existingRequests[0].loyaltyPointsAwarded || 0), createdAt: existingRequests[0].createdAt };

    const id = `offer-purchase-${randomUUID()}`;
    await tx.insert(offerPurchaseRequests).values({
      id,
      offerId: input.offerId,
      offerTitle,
      offerSnapshot,
      offerPoints,
      customerName: profile.name,
      customerPhone: profile.phone || null,
      customerNote: input.customerNote?.trim().slice(0, 1000) || null,
      customerCode: profile.customerCode,
      status: "pending",
      loyaltyPointsAwarded: 0,
    });
    const created = await tx.select().from(offerPurchaseRequests).where(eq(offerPurchaseRequests.id, id)).limit(1);
    if (!created[0]) throw new Error("تعذر حفظ طلب العرض");
    return { id: created[0].id, offerTitle: created[0].offerTitle, status: created[0].status, loyaltyPointsAwarded: Number(created[0].loyaltyPointsAwarded || 0), createdAt: created[0].createdAt };
  });
}

export async function listOfferPurchaseRequests() {
  const database = await getDb();
  if (!database) return [];
  return database.select().from(offerPurchaseRequests).orderBy(desc(offerPurchaseRequests.createdAt)).limit(200);
}

export async function approveOfferPurchaseRequest(id: string) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لتأكيد طلب العرض الآن");

  return database.transaction(async tx => {
    const requests = await tx.select().from(offerPurchaseRequests).where(eq(offerPurchaseRequests.id, id)).for("update").limit(1);
    const request = requests[0];
    if (!request) throw new Error("طلب العرض غير موجود");
    if (request.status === "approved") return { success: true as const, alreadyApproved: true, awardedPoints: Number(request.loyaltyPointsAwarded || 0), customerCode: request.customerCode };
    if (request.status !== "pending") throw new Error("لا يمكن تأكيد طلب مرفوض أو ملغى");

    const profile = await getSupabaseLoyaltyProfile({ customerCode: request.customerCode, phone: request.customerPhone });
    if (!profile) throw new Error("تعذر العثور على بطاقة ولاء العميل");
    const plannedPoints = Math.max(0, Math.trunc(Number(request.offerPoints) || 0));
    const event = plannedPoints > 0 ? await applySupabaseLoyaltyEvent({
      phone: profile.phone, name: profile.name, pointsDelta: plannedPoints, source: "offer",
      sourceId: request.id, idempotencyKey: `offer-purchase:${request.id}:earned`,
      description: `${plannedPoints} نقطة بعد موافقة المحل على شراء العرض: ${request.offerTitle}`,
    }) : null;
    const awardedPoints = event ? Math.max(0, Number(event.points_delta) || 0) : 0;
    await tx.update(offerPurchaseRequests).set({
      status: "approved",
      loyaltyPointsAwarded: awardedPoints,
      approvedAt: new Date(),
    }).where(eq(offerPurchaseRequests.id, request.id));
    return { success: true as const, alreadyApproved: false, awardedPoints, customerCode: profile.customerCode };
  });
}

export async function cancelOfferPurchaseRequest(id: string) {
  const database = await getDb();
  if (!database) throw new Error("قاعدة البيانات غير متاحة لتحديث طلب العرض الآن");
  return database.transaction(async tx => {
    const requests = await tx.select().from(offerPurchaseRequests).where(eq(offerPurchaseRequests.id, id)).for("update").limit(1);
    const request = requests[0];
    if (!request) throw new Error("طلب العرض غير موجود");
    if (request.status === "approved") throw new Error("تمت الموافقة على هذا الطلب وإضافة النقاط بالفعل؛ لا يمكن رفضه الآن");
    if (request.status === "pending") await tx.update(offerPurchaseRequests).set({ status: "cancelled" }).where(eq(offerPurchaseRequests.id, id));
    return { success: true as const, status: "cancelled" as const };
  });
}

export async function getCustomerOfferPurchaseStatus(input: { id: string; customerCode: string }) {
  const database = await getDb();
  if (!database) return null;
  const rows = await database.select({ id: offerPurchaseRequests.id, offerTitle: offerPurchaseRequests.offerTitle, status: offerPurchaseRequests.status, loyaltyPointsAwarded: offerPurchaseRequests.loyaltyPointsAwarded, createdAt: offerPurchaseRequests.createdAt }).from(offerPurchaseRequests).where(and(
    eq(offerPurchaseRequests.id, input.id),
    eq(offerPurchaseRequests.customerCode, input.customerCode.trim().toUpperCase()),
  )).limit(1);
  return rows[0] || null;
}

export async function getCustomerLoyaltyProfile(identifier: LoyaltyIdentifier) {
  return getSupabaseLoyaltyProfile(typeof identifier === "string" ? { phone: identifier } : identifier);
}
export async function listCustomerLoyalty() {
  return listSupabaseLoyaltyProfiles();
}

export async function redeemLoyaltyReward(input: { phone?: string; customerCode?: string; giftName: string; points: number; mode: "deduct" | "reset" }) {
  const existing = await getSupabaseLoyaltyProfile({ phone: input.phone, customerCode: input.customerCode });
  if (!existing) throw new Error("العميل غير مسجل في دفتر الولاء");
  const currentPoints = Math.max(0, Number(existing.points || 0));
  const pointsToDeduct = input.mode === "reset" ? currentPoints : Math.min(currentPoints, Math.max(0, Math.trunc(Number(input.points) || 0)));
  if (pointsToDeduct <= 0) throw new Error("رصيد العميل لا يكفي لاستبدال الهدية");
  const event = await applySupabaseLoyaltyEvent({ phone: existing.phone, name: existing.name, pointsDelta: -pointsToDeduct, source: "reward", sourceId: input.giftName.trim().slice(0, 160), idempotencyKey: `reward:${existing.customerCode}:${randomUUID()}`, description: `استبدال هدية: ${input.giftName}` });
  return { profile: await getSupabaseLoyaltyProfile({ phone: existing.phone }), pointsDeducted: Math.abs(Number(event.points_delta) || 0) };
}

async function getCatalogProductPoints() {
  const pointsByProductId = new Map<string, number>();
  for (const key of ["abu_raghwa_products", "abu_catalog_manual_products", "abu_raghwa_recipes"]) {
    const setting = await getGlobalAppSetting(key);
    if (!setting) continue;
    const entries = parseJsonArray<{ id?: string; loyaltyPoints?: number }>(setting.dataJson);
    for (const entry of entries) {
      if (!entry.id) continue;
      const id = key === "abu_raghwa_recipes" ? `catalog_recipe_${entry.id}` : entry.id;
      pointsByProductId.set(id, Math.max(0, Math.trunc(Number(entry.loyaltyPoints) || 0)));
    }
  }
  return pointsByProductId;
}

async function getPointsFromItems(itemsJson: string) {
  const items = parseJsonArray<{ productId?: string; quantity?: number; loyaltyPoints?: number }>(itemsJson);
  const pointsByProductId = await getCatalogProductPoints();
  return items.reduce((sum, item) => {
    const points = pointsByProductId.get(item.productId || "") ?? Math.max(0, Math.trunc(Number(item.loyaltyPoints) || 0));
    return sum + points * Math.max(0, Math.trunc(Number(item.quantity) || 0));
  }, 0);
}

export async function recordDirectSaleLoyalty(input: { saleId: string; customerName: string; phone?: string; customerCode?: string; itemsJson: string }) {
  const name = input.customerName.trim();
  if (!name) return { profile: null, pointsAwarded: 0 };
  const existing = await getSupabaseLoyaltyProfile({ phone: input.phone, customerCode: input.customerCode });
  if (input.customerCode?.trim() && !existing) throw new Error("كود نقاط الولاء غير صحيح");
  const pointsAwarded = await getPointsFromItems(input.itemsJson);
  if (pointsAwarded > 0) {
    const event = await applySupabaseLoyaltyEvent({ phone: input.phone || existing?.phone || "", name, pointsDelta: pointsAwarded, source: "cashier", sourceId: input.saleId, idempotencyKey: `cashier-sale:${input.saleId}`, description: `نقاط شراء من الفاتورة #${input.saleId.slice(-6).toUpperCase()}` });
    return { profile: await getSupabaseLoyaltyProfile({ phone: input.phone }), pointsAwarded: Number(event.points_delta) || 0 };
  }
  const profile = existing || (input.phone ? await ensureSupabaseLoyaltyProfile({ phone: input.phone, name }) : null);
  const customerCode = existing?.customerCode || (profile && "customer_code" in profile ? profile.customer_code : undefined);
  return { profile: customerCode ? await getSupabaseLoyaltyProfile({ customerCode }) : null, pointsAwarded: 0 };
}

export async function reverseDirectSaleLoyalty(input: { returnId: string; saleId: string; customerName: string; phone?: string; customerCode?: string; points: number }) {
  const points = Math.max(0, Math.trunc(Number(input.points) || 0));
  if (!points) return { profile: await getCustomerLoyaltyProfile({ customerCode: input.customerCode, phone: input.phone }), pointsReversed: 0 };
  const existing = await getSupabaseLoyaltyProfile({ customerCode: input.customerCode, phone: input.phone });
  if (!existing) return { profile: null, pointsReversed: 0 };
  const event = await applySupabaseLoyaltyEvent({ phone: existing.phone, name: input.customerName || existing.name, pointsDelta: -points, source: "cashier", sourceId: input.saleId, idempotencyKey: `cashier-return:${input.returnId}`, description: `عكس ${points} نقطة بسبب مرتجع الفاتورة #${input.saleId.slice(-6).toUpperCase()}` });
  return { profile: await getSupabaseLoyaltyProfile({ phone: existing.phone }), pointsReversed: Math.abs(Number(event.points_delta) || 0) };
}

export async function restoreDirectSaleLoyalty(input: { restoreId: string; saleId: string; customerName: string; phone?: string; customerCode?: string; points: number }) {
  const points = Math.max(0, Math.trunc(Number(input.points) || 0));
  const existing = await getSupabaseLoyaltyProfile({ customerCode: input.customerCode, phone: input.phone });
  if (!points || !existing) return { profile: existing, pointsRestored: 0 };
  const event = await applySupabaseLoyaltyEvent({ phone: existing.phone, name: input.customerName || existing.name, pointsDelta: points, source: "cashier", sourceId: input.saleId, idempotencyKey: `cashier-return-restore:${input.restoreId}`, description: `استعادة ${points} نقطة بعد استعادة الفاتورة #${input.saleId.slice(-6).toUpperCase()}` });
  return { profile: await getSupabaseLoyaltyProfile({ phone: existing.phone }), pointsRestored: Number(event.points_delta) || 0 };
}

export async function updateCatalogOrderStatus(id: string, status: CatalogOrderStatus) {
  const db = await getDb();
  if (!db) throw new Error("قاعدة البيانات غير متاحة لتحديث الطلب الآن");
  const rows = await db.select().from(catalogOrders).where(eq(catalogOrders.id, id)).limit(1);
  const order = rows[0];
  if (!order) throw new Error("الطلب غير موجود");
  let awardedPoints = Number(order.loyaltyPointsAwarded || 0);
  if (status === "delivered" && order.status !== "delivered" && awardedPoints === 0) {
    const points = await getPointsFromItems(order.itemsJson);
    if (points > 0) {
      const event = await applySupabaseLoyaltyEvent({ phone: order.customerPhone, name: order.customerName, pointsDelta: points, source: "catalog", sourceId: order.id, idempotencyKey: `catalog-order:${order.id}:earned`, description: `نقاط شراء من الكتالوج للطلب #${order.id.slice(-6).toUpperCase()}` });
      awardedPoints = Math.max(0, Number(event.points_delta) || 0);
    }
  }
  if (status === "cancelled" && order.status !== "cancelled" && awardedPoints > 0) {
    await applySupabaseLoyaltyEvent({ phone: order.customerPhone, name: order.customerName, pointsDelta: -awardedPoints, source: "catalog", sourceId: order.id, idempotencyKey: `catalog-order:${order.id}:reversed`, description: `سحب نقاط الطلب الملغي #${order.id.slice(-6).toUpperCase()}` });
    awardedPoints = 0;
  }
  await db.update(catalogOrders).set({ status, loyaltyPointsAwarded: awardedPoints }).where(eq(catalogOrders.id, id));
  return { awardedPoints };
}

export async function getCatalogOrdersForCustomer(orderIds: string[], customerPhone: string) {
  const db = await getDb();
  if (!db || !orderIds.length) return [];
  return db.select().from(catalogOrders).where(and(inArray(catalogOrders.id, orderIds), eq(catalogOrders.customerPhone, customerPhone), isNull(catalogOrders.archivedAt))).orderBy(desc(catalogOrders.createdAt));
}
