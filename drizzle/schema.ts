import { double, index, int, longtext, mysqlEnum, mysqlTable, primaryKey, text, timestamp, tinyint, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/**
 * Local staff accounts are kept in their own rows instead of a shared JSON
 * setting. This gives registration, approval, and login a unique constraint
 * and atomic updates, while leaving the legacy setting available for import.
 */
export const staffAccounts = mysqlTable("staff_accounts", {
  id: varchar("id", { length: 96 }).primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  role: mysqlEnum("role", ["manager", "admin", "seller"]).default("seller").notNull(),
  status: mysqlEnum("status", ["PENDING_APPROVAL", "APPROVED"]).default("PENDING_APPROVAL").notNull(),
  isBlocked: tinyint("isBlocked").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastLoginAt: timestamp("lastLoginAt"),
}, table => ({
  emailIdx: index("staff_accounts_email_idx").on(table.email),
  statusIdx: index("staff_accounts_status_idx").on(table.status),
}));

export const sharedOffers = mysqlTable("shared_offers", {
  id: varchar("id", { length: 64 }).primaryKey(),
  offerData: text("offerData").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const customerLoyalty = mysqlTable("customer_loyalty", {
  id: int("id").autoincrement().primaryKey(),
  customerCode: varchar("customerCode", { length: 48 }).notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  name: text("name").notNull(),
  points: int("points").default(0).notNull(),
  usedCoupons: text("usedCoupons").notNull(),
  transactionsJson: text("transactionsJson"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  phoneIdx: index("customer_loyalty_phone_idx").on(table.phone),
}));

// Shared legacy settings remain available for scalar values and migration fallback.
export const globalAppSettings = mysqlTable("global_app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  dataJson: longtext("dataJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// One row per item in shared collections; large arrays are never stored as one blob.
export const cloudAppRecords = mysqlTable("cloud_app_records", {
  collectionKey: varchar("collectionKey", { length: 128 }).notNull(),
  recordId: varchar("recordId", { length: 191 }).notNull(),
  position: int("position").default(0).notNull(),
  dataJson: longtext("dataJson").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  pk: primaryKey({ columns: [table.collectionKey, table.recordId] }),
}));

export const cloudAppBackups = mysqlTable("cloud_app_backups", {
  id: int("id").autoincrement().primaryKey(),
  collectionKey: varchar("collectionKey", { length: 128 }).notNull(),
  dataJson: longtext("dataJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const catalogOrders = mysqlTable("catalog_orders", {
  id: varchar("id", { length: 64 }).primaryKey(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }).notNull(),
  customerCode: varchar("customerCode", { length: 48 }),
  address: text("address"),
  note: text("note"),
  itemsJson: text("itemsJson").notNull(),
  totalAmount: double("totalAmount").notNull(),
  fulfillmentMethod: mysqlEnum("fulfillmentMethod", ["pickup", "delivery"]).default("pickup").notNull(),
  priceAdjustmentPercent: double("priceAdjustmentPercent").default(0).notNull(),
  status: mysqlEnum("status", ["new", "contacted", "confirmed", "preparing", "delivered", "cancelled"]).default("new").notNull(),
  loyaltyPointsAwarded: int("loyaltyPointsAwarded").default(0).notNull(),
  archivedAt: timestamp("archivedAt"),
  archivedPointsReversed: int("archivedPointsReversed").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusCreatedIdx: index("catalog_orders_status_created_idx").on(table.status, table.createdAt),
  customerPhoneIdx: index("catalog_orders_customer_phone_idx").on(table.customerPhone),
}));

export const offerPurchaseRequests = mysqlTable("offer_purchase_requests", {
  id: varchar("id", { length: 64 }).primaryKey(),
  offerId: varchar("offerId", { length: 64 }).notNull(),
  offerTitle: varchar("offerTitle", { length: 255 }).notNull(),
  offerSnapshot: longtext("offerSnapshot").notNull(),
  offerPoints: int("offerPoints").default(0).notNull(),
  customerName: varchar("customerName", { length: 255 }).notNull(),
  customerPhone: varchar("customerPhone", { length: 32 }),
  customerCode: varchar("customerCode", { length: 48 }).notNull(),
  status: mysqlEnum("status", ["pending", "approved", "cancelled"]).default("pending").notNull(),
  loyaltyPointsAwarded: int("loyaltyPointsAwarded").default(0).notNull(),
  approvedAt: timestamp("approvedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusCreatedIdx: index("offer_purchase_requests_status_created_idx").on(table.status, table.createdAt),
  customerCodeIdx: index("offer_purchase_requests_customer_code_idx").on(table.customerCode),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type StaffAccount = typeof staffAccounts.$inferSelect;
export type InsertStaffAccount = typeof staffAccounts.$inferInsert;
export type SharedOffer = typeof sharedOffers.$inferSelect;
export type CustomerLoyaltyRow = typeof customerLoyalty.$inferSelect;
export type GlobalAppSetting = typeof globalAppSettings.$inferSelect;
export type CloudAppRecord = typeof cloudAppRecords.$inferSelect;
export type CloudAppBackup = typeof cloudAppBackups.$inferSelect;
export type CatalogOrderRow = typeof catalogOrders.$inferSelect;
export type OfferPurchaseRequestRow = typeof offerPurchaseRequests.$inferSelect;
