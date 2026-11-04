import { and, asc, desc, eq, gt, inArray, isNull, max, notInArray, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { createClient } from "@supabase/supabase-js";
import { InsertUser, InsertStaffAccount, users, staffAccounts, sharedOffers, globalAppSettings, cloudAppRecords, cloudAppBackups, catalogOrders, offerPurchaseRequests } from "../drizzle/schema";
import { ENV } from './_core/env';
import { getOfferEndAt } from "../client/src/lib/offerExpiry";
import { mergeSharedOfferRecords, removeOfferFromLegacyData } from "./sharedOffers";
import { applySupabaseLoyaltyEvent, ensureSupabaseLoyaltyProfile, getSupabaseLoyaltyProfile, listSupabaseLoyaltyProfiles, validateCatalogCouponServer, type SupabaseLoyaltyTransaction } from "./supabaseLoyalty";
import * as loyaltyModule from "./supabaseLoyalty";

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

function getSupabaseServerClient() {
  const existing = (loyaltyModule as any).supabase || 
                   (loyaltyModule as any).supabaseAdmin || 
                   (loyaltyModule as any).supabaseClient ||
                   (typeof (loyaltyModule as any).getSupabaseClient === "function" ? (loyaltyModule as any).getSupabaseClient() : null) ||
                   (typeof (loyaltyModule as any).getSupabaseAdminClient === "function" ? (loyaltyModule as any).getSupabaseAdminClient() : null);
  if (existing) return existing;

  const url = process.env.SUPABASE_URL || 
              process.env.VITE_SUPABASE_URL || 
              process.env.NEXT_PUBLIC_SUPABASE_URL || 
              (ENV as any)?.supabaseUrl || 
              (ENV as any)?.SUPABASE_URL || 
              "https://smkqizjpdbnbyoumgdwi.supabase.co";

  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || 
              process.env.SUPABASE_SERVICE_KEY || 
              process.env.SUPABASE_ANON_KEY || 
              process.env.VITE_SUPABASE_ANON_KEY || 
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
              (ENV as any)?.supabaseServiceRoleKey || 
              (ENV as any)?.supabaseKey || 
              (ENV as any)?.supabaseAnonKey || 
              (ENV as any)?.SUPABASE_SERVICE_ROLE_KEY || 
              (ENV as any)?.SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      return createClient(url, key);
    } catch (e) {
      console.warn("[Supabase] Failed to init client:", e);
    }
  }
  return null;
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
      if (!isMissingCloudTableError(error)) throw error;
      await db.insert(globalAppSettings).values({ key, dataJson }).onDuplicateKeyUpdate({ set: { dataJson } });
    }
    return;
  }
  await db.insert(globalAppSettings).values({ key, dataJson }).onDuplicateKeyUpdate({ set: { dataJson } });
}

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
      selected = incomingItem || currentItem;
    } else if (!incomingItem) {
      selected = currentItem && !jsonValuesEqual(currentItem, baseItem) ? currentItem : undefined;
    } else if (!currentItem) {
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
    } catch { }
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
 
