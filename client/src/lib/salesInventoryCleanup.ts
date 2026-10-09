export type CleanupSaleItem = {
  productId?: string;
  productName?: string;
  selectedUnitType?: string;
  quantity?: number;
  loyaltyPoints?: number;
};

export type CleanupSale = {
  id: string;
  date: string;
  total?: number;
  items?: CleanupSaleItem[];
  customerName?: string;
  customerPhone?: string;
  customerCode?: string;
  loyaltyPointsAwarded?: number;
  returnedPointsReversed?: number;
  returnedItems?: Array<{ lineIndex?: number; productId?: string; quantity?: number; pointsReversed?: number }>;
};

export type ArchivedSale<TSale extends CleanupSale = CleanupSale> = {
  archiveId: string;
  archivedAt: string;
  pointsReversed: number;
  stockRestored: Record<string, number>;
  sale: TSale;
};

export const parseArchivedSales = <TSale extends CleanupSale = CleanupSale>(raw: string | null): ArchivedSale<TSale>[] => {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is ArchivedSale<TSale> => Boolean(item)
      && typeof item.archiveId === "string"
      && typeof item.archivedAt === "string"
      && typeof item.sale?.id === "string"
      && (item.sale.items == null || Array.isArray(item.sale.items)));
  } catch {
    return [];
  }
};

export const addArchivedSale = <TSale extends CleanupSale>(items: readonly ArchivedSale<TSale>[], item: ArchivedSale<TSale>) =>
  [item, ...items.filter(existing => existing.sale.id !== item.sale.id)];

export const removeArchivedSale = <TSale extends CleanupSale>(items: readonly ArchivedSale<TSale>[], saleId: string) =>
  items.filter(item => item.sale.id !== saleId);

export const filterActiveSales = <TSale extends CleanupSale>(sales: readonly TSale[], archived: readonly ArchivedSale<TSale>[], permanentlyDeletedIds: readonly string[]) => {
  const excluded = new Set([...archived.map(item => item.sale.id), ...permanentlyDeletedIds]);
  return sales.filter(sale => !excluded.has(sale.id));
};

export const getOutstandingSaleQuantity = (sale: CleanupSale, itemIndex: number) => {
  const item = sale.items?.[itemIndex];
  if (!item) return 0;
  const sold = Math.max(0, Number(item.quantity) || 0);
  const returned = (sale.returnedItems || [])
    .filter(entry => entry.lineIndex === itemIndex || (entry.lineIndex == null && entry.productId === item.productId))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.quantity) || 0), 0);
  return Math.max(0, sold - returned);
};

export const getOutstandingSalePoints = (sale: CleanupSale) => {
  const itemPoints = (sale.items || []).reduce((sum, item, index) =>
    sum + Math.max(0, Math.trunc(Number(item.loyaltyPoints) || 0)) * Math.trunc(getOutstandingSaleQuantity(sale, index)), 0);
  const awarded = sale.loyaltyPointsAwarded == null
    ? itemPoints
    : Math.max(0, Math.trunc(Number(sale.loyaltyPointsAwarded) || 0));
  const returnedPoints = (sale.returnedItems || []).reduce((sum, item) => sum + Math.max(0, Math.trunc(Number(item.pointsReversed) || 0)), 0);
  const alreadyReversed = sale.returnedPointsReversed == null
    ? returnedPoints
    : Math.max(0, Math.trunc(Number(sale.returnedPointsReversed) || 0));
  return Math.max(0, awarded - alreadyReversed);
};
