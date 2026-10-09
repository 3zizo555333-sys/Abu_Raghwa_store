export type InvoiceLoyaltyItem = {
  quantity?: number;
  loyaltyPoints?: number;
};

export type InvoiceLoyaltySale = {
  loyaltyPointsAwarded?: number;
  items?: InvoiceLoyaltyItem[];
};

export function getInvoiceLoyaltyPoints(sale: InvoiceLoyaltySale) {
  const recorded = Math.max(0, Math.trunc(Number(sale.loyaltyPointsAwarded) || 0));
  const fromItems = (Array.isArray(sale.items) ? sale.items : []).reduce(
    (sum, item) => sum + Math.max(0, Math.trunc(Number(item.loyaltyPoints) || 0)) * Math.max(0, Math.trunc(Number(item.quantity) || 0)),
    0,
  );
  return Math.max(recorded, fromItems);
}
