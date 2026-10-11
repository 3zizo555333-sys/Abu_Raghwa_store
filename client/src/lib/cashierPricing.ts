export type SaleType = "retail" | "wholesale" | "bulk";

export const saleTypeLabel: Record<SaleType, string> = {
  retail: "قطاعي",
  wholesale: "تجزئة",
  bulk: "جملة",
};

export type CashierPriceSource = {
  retailPrice?: number | null;
  wholesaleRetailPrice?: number | null;
  bulkPrice?: number | null;
  loyaltyPoints?: number | null;
  retailLoyaltyPoints?: number | null;
  subWholesaleLoyaltyPoints?: number | null;
  wholesaleLoyaltyPoints?: number | null;
};

export type CashierSaleValues = {
  prices: Record<SaleType, number>;
  points: Record<SaleType, number>;
  unitPrice: number;
  loyaltyPoints: number;
};

export type CashierCartItem = {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  unit: string;
  loyaltyPoints: number;
  prices: Record<SaleType, number>;
  points: Record<SaleType, number>;
};

const numericOrZero = (value: number | null | undefined) => Number(value) || 0;

export function getCashierSaleValues(product: CashierPriceSource, saleType: SaleType): CashierSaleValues {
  const retailPrice = numericOrZero(product.retailPrice);
  const wholesaleRetailPrice = numericOrZero(product.wholesaleRetailPrice) || retailPrice;
  const prices: Record<SaleType, number> = {
    retail: retailPrice,
    wholesale: wholesaleRetailPrice,
    bulk: numericOrZero(product.bulkPrice) || wholesaleRetailPrice || retailPrice,
  };
  const legacyPoints = numericOrZero(product.loyaltyPoints);
  const points: Record<SaleType, number> = {
    retail: numericOrZero(product.retailLoyaltyPoints ?? legacyPoints),
    wholesale: numericOrZero(product.subWholesaleLoyaltyPoints ?? legacyPoints),
    bulk: numericOrZero(product.wholesaleLoyaltyPoints ?? legacyPoints),
  };

  return { prices, points, unitPrice: prices[saleType], loyaltyPoints: points[saleType] };
}

export function repriceCashierCart(cart: CashierCartItem[], saleType: SaleType): CashierCartItem[] {
  return cart.map(item => ({
    ...item,
    unitPrice: item.prices[saleType],
    loyaltyPoints: item.points[saleType],
    total: item.quantity * item.prices[saleType],
  }));
}
