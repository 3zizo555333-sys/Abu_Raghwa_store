export const CATALOG_ORDER_STATUSES = [
  "new",
  "contacted",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
] as const;

export type CatalogOrderStatus = (typeof CATALOG_ORDER_STATUSES)[number];

const STATUS_ALIASES: Readonly<Record<string, CatalogOrderStatus>> = {
  pending: "new",
  new: "new",
  "جديد": "new",
  "قيد الانتظار": "new",
  contacted: "contacted",
  "تم التواصل": "contacted",
  confirmed: "confirmed",
  accepted: "confirmed",
  approved: "confirmed",
  "مؤكد": "confirmed",
  "تم القبول": "confirmed",
  preparing: "preparing",
  "جاري التجهيز": "preparing",
  "جارٍ التجهيز": "preparing",
  ready: "ready",
  "جاهز": "ready",
  "جاهز للاستلام": "ready",
  delivered: "delivered",
  completed: "delivered",
  "تم التسليم": "delivered",
  "مكتمل": "delivered",
  cancelled: "cancelled",
  canceled: "cancelled",
  "ملغي": "cancelled",
  "ملغى": "cancelled",
};

export function normalizeCatalogOrderStatus(value: unknown): CatalogOrderStatus {
  if (typeof value !== "string") return "new";
  const normalized = value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
  return STATUS_ALIASES[normalized] ?? "new";
}

export function isCatalogOrderArchived(value: unknown): boolean {
  const status = normalizeCatalogOrderStatus(value);
  return status === "delivered" || status === "cancelled";
}

export function toDatabaseCatalogOrderStatus(status: CatalogOrderStatus): string {
  return status === "new" ? "pending" : status;
}
