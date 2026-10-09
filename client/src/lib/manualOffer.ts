export type ManualDiscountType = "percent" | "fixed";

export type ManualOfferPriceResult = {
  valid: boolean;
  offerPrice: number;
  discountAmount: number;
  discountPercent: number;
  error?: string;
};

export function calculateManualOfferPrice(
  retailPrice: number,
  costPrice: number,
  discountType: ManualDiscountType,
  discountValue: number,
): ManualOfferPriceResult {
  if (!Number.isFinite(retailPrice) || retailPrice <= 0 || !Number.isFinite(costPrice) || costPrice < 0) {
    return { valid: false, offerPrice: 0, discountAmount: 0, discountPercent: 0, error: "أسعار المنتج غير صالحة لإنشاء العرض" };
  }
  if (!Number.isFinite(discountValue) || discountValue < 0) {
    return { valid: false, offerPrice: retailPrice, discountAmount: 0, discountPercent: 0, error: "اكتب خصمًا صحيحًا" };
  }
  if (discountType === "percent" && discountValue > 100) {
    return { valid: false, offerPrice: retailPrice, discountAmount: 0, discountPercent: 0, error: "نسبة الخصم لا يمكن أن تتجاوز 100%" };
  }

  const requestedDiscount = discountType === "percent" ? (retailPrice * discountValue) / 100 : discountValue;
  const offerPrice = Math.round((retailPrice - requestedDiscount) * 100) / 100;
  if (offerPrice < costPrice) {
    const maximumDiscount = Math.max(0, retailPrice - costPrice);
    return {
      valid: false,
      offerPrice,
      discountAmount: requestedDiscount,
      discountPercent: retailPrice > 0 ? Math.round((requestedDiscount / retailPrice) * 10000) / 100 : 0,
      error: `هذا الخصم يسبب خسارة. أقصى خصم آمن هو ${maximumDiscount.toFixed(2)} ج.م حتى يبقى السعر عند تكلفة الجملة أو أعلى.`,
    };
  }

  const discountAmount = Math.round((retailPrice - offerPrice) * 100) / 100;
  return {
    valid: true,
    offerPrice,
    discountAmount,
    discountPercent: retailPrice > 0 ? Math.round((discountAmount / retailPrice) * 10000) / 100 : 0,
  };
}
