export type SalesReturnItem = {
  lineIndex: number;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  pointsReversed: number;
  returnedAt: string;
};

export type ReturnSaleLine = {
  productId: string;
  productName: string;
  selectedUnitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
  loyaltyPoints?: number;
};

export type ReturnSale = {
  id: string;
  items: ReturnSaleLine[];
  total: number;
  subTotal?: number;
  returnedItems?: SalesReturnItem[];
  returnedTotal?: number;
  returnedPointsReversed?: number;
};

export const getReturnedQuantity = (sale: Pick<ReturnSale, "returnedItems">, lineIndex: number) => (sale.returnedItems || [])
  .filter(item => item.lineIndex === lineIndex)
  .reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);

export const getReturnableQuantity = (sale: Pick<ReturnSale, "items" | "returnedItems">, lineIndex: number) => {
  const item = sale.items[lineIndex];
  return Math.max(0, Number(item?.quantity) || 0) - getReturnedQuantity(sale, lineIndex);
};

export type CalculatedReturnItem = {
  lineIndex: number;
  item: ReturnSaleLine;
  quantity: number;
  total: number;
  pointsReversed: number;
};

export function calculateReturnItems(
  sale: ReturnSale,
  requestedQuantities: Record<number, string | number>,
  loyaltyPointsForItem: (item: ReturnSaleLine) => number,
) {
  const saleSubTotal = Math.max(0, Number(sale.subTotal) || sale.items.reduce((sum, item) => sum + item.total, 0));
  const discountFactor = saleSubTotal > 0 ? Math.max(0, Number(sale.total) || 0) / saleSubTotal : 1;
  return sale.items.flatMap((item, lineIndex): CalculatedReturnItem[] => {
    const requested = Number(requestedQuantities[lineIndex] || 0);
    const remaining = getReturnableQuantity(sale, lineIndex);
    if (!Number.isFinite(requested) || requested <= 0) return [];
    if (requested > remaining) throw new Error(`الكمية المرتجعة من «${item.productName}» أكبر من المتاح للإرجاع`);
    const unitRefund = Number(item.unitPrice) * discountFactor;
    return [{
      lineIndex,
      item,
      quantity: requested,
      total: unitRefund * requested,
      pointsReversed: Math.max(0, Math.trunc(Number(loyaltyPointsForItem(item)) || 0)) * Math.max(0, Math.trunc(requested)),
    }];
  });
}

export function appendSaleReturn<T extends ReturnSale>(sale: T, returnedItems: SalesReturnItem[]): T {
  const returnedTotal = returnedItems.reduce((sum, item) => sum + item.total, 0);
  const returnedPointsReversed = returnedItems.reduce((sum, item) => sum + item.pointsReversed, 0);
  return {
    ...sale,
    returnedItems: [...(sale.returnedItems || []), ...returnedItems],
    returnedTotal: Math.round((returnedTotal + (Number(sale.returnedTotal) || 0)) * 100) / 100,
    returnedPointsReversed: returnedPointsReversed + (Number(sale.returnedPointsReversed) || 0),
  };
}
