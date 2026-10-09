export type PackageUnitProductLike = {
  unit?: string;
  unitName?: string;
  contentUnit?: string;
  unitsPerPackage?: number;
  pieces?: number;
  unitValue?: number;
};

const asPositiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
};

export const getOuterPackageUnit = (product: PackageUnitProductLike) => String(product.unit || product.unitName || "عبوة").trim() || "عبوة";

export const getContentUnit = (product: PackageUnitProductLike) => String(product.contentUnit || "قطعة").trim() || "قطعة";

export const getContentsPerPackage = (product: PackageUnitProductLike) => asPositiveNumber(product.unitsPerPackage || product.pieces || product.unitValue);

export const getPackageDescription = (product: PackageUnitProductLike) => `${getContentsPerPackage(product)} ${getContentUnit(product)} داخل ${getOuterPackageUnit(product)}`;

/** البيع اليومي يتم من محتوى العبوة فقط: قطعة أو كيلو أو لتر أو الوحدة التي يكتبها المدير. */
export const getSaleUnitOptions = (product: PackageUnitProductLike) => [getContentUnit(product)];

export const isOuterPackageUnit = (product: PackageUnitProductLike, selectedUnit: string) => String(selectedUnit || "").trim() === getOuterPackageUnit(product);

/** يحول الكمية المباعة إلى عدد العبوات التي تخصم من المخزون. */
export const getPackageStockDeduction = (product: PackageUnitProductLike, selectedUnit: string, soldQuantity: number) => {
  const quantity = Math.max(0, Number(soldQuantity) || 0);
  return isOuterPackageUnit(product, selectedUnit) ? quantity : quantity / getContentsPerPackage(product);
};

/** يحول سعر وحدة المحتوى إلى سعر بيع العبوة كاملة عند اختيارها. */
export const getSalePriceForUnit = (product: PackageUnitProductLike, contentUnitPrice: number, selectedUnit: string) => {
  const price = Math.max(0, Number(contentUnitPrice) || 0);
  return isOuterPackageUnit(product, selectedUnit) ? price * getContentsPerPackage(product) : price;
};
