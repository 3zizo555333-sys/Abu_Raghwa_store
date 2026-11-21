export type CatalogCouponValidationResult = {
  valid: boolean;
  min_order_amount?: number;
  error_code?: string;
};

export function normalizeCatalogCouponPhone(phone: string | null | undefined): string {
  return String(phone || "").replace(/\s+/g, "").replace(/^\+2/, "");
}

function formatCouponMoney(amount: number): string {
  return new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 2 }).format(Math.max(0, Number(amount) || 0));
}

export function catalogCouponValidationError(result: CatalogCouponValidationResult, orderAmount = 0): string {
  if (result.error_code === "coupon_already_used") {
    return "لقد استخدمت هذا الكوبون من قبل؛ يُسمح باستخدام الكوبون مرة واحدة فقط لكل عميل";
  }
  if (result.error_code === "min_order_not_met") {
    const minimum = Math.max(0, Number(result.min_order_amount) || 0);
    const difference = Math.max(0, minimum - (Number(orderAmount) || 0));
    return `الحد الأدنى لاستخدام هذا الكوبون هو ${formatCouponMoney(minimum)} جنيه (أضف منتجات بقيمة ${formatCouponMoney(difference)} جنيه لتفعيله)`;
  }
  if (result.error_code === "coupon_expired") return "انتهت صلاحية هذا الكوبون.";
  if (result.error_code === "coupon_not_started") return "لم يبدأ موعد استخدام هذا الكوبون بعد.";
  return "الكوبون غير صالح أو غير متاح حالياً.";
}
