export type PackageUnitProductLike = {
  unit?: string;
  unitName?: string;
  saleMode?: "unit" | "weight";
  contentUnit?: string;
  unitsPerPackage?: number;
  pieces?: number;
  unitValue?: number;
  bulkUnitName?: string | null;
  unitsPerBulk?: number;
  bulkUnitPrice?: number | null;
};

const asPositiveNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
};

export const getOuterPackageUnit = (product: PackageUnitProductLike) => String(product.unitName || product.unit || "عبوة").trim() || "عبوة";

export const getContentUnit = (product: PackageUnitProductLike) => String(product.contentUnit || "قطعة").trim() || "قطعة";

export const getContentsPerPackage = (product: PackageUnitProductLike) => asPositiveNumber(product.unitsPerPackage || product.pieces || product.unitValue);

export const getPackageDescription = (product: PackageUnitProductLike) => `${getContentsPerPackage(product)} ${getContentUnit(product)} داخل ${getOuterPackageUnit(product)}`;

export const getBulkUnitName = (product: PackageUnitProductLike) => String(product.bulkUnitName || "").trim();

export const getUnitsPerBulk = (product: PackageUnitProductLike) => asPositiveNumber(product.unitsPerBulk);

export const hasConfiguredBulkUnit = (product: PackageUnitProductLike) => {
  const name = getBulkUnitName(product);
  const price = Number(product.bulkUnitPrice);
  return Boolean(name)
    && name !== getContentUnit(product)
    && Number.isFinite(price)
    && price > 0
    && Number(product.unitsPerBulk ?? 1) > 0;
};

/** Cashier choices: the content unit and, only when fully configured, the large sale unit. */
export const getSaleUnitOptions = (product: PackageUnitProductLike, includeOuterPackage = false) => {
  const contentUnit = getContentUnit(product);
  if (product.saleMode === "weight") return [contentUnit];
  if (hasConfiguredBulkUnit(product)) return [contentUnit, getBulkUnitName(product)];
  const outerUnit = getOuterPackageUnit(product);
  return includeOuterPackage && outerUnit !== contentUnit ? [contentUnit, outerUnit] : [contentUnit];
};

export const isOuterPackageUnit = (product: PackageUnitProductLike, selectedUnit: string) => String(selectedUnit || "").trim() === getOuterPackageUnit(product);

export const isConfiguredBulkUnit = (product: PackageUnitProductLike, selectedUnit: string) =>
  hasConfiguredBulkUnit(product) && String(selectedUnit || "").trim() === getBulkUnitName(product);

/** Converts a sale quantity to the existing canonical stock unit (unit_name packages).
 * Bulk counts are entered in content units, so divide their piece consumption by
 * units_per_package instead of changing the meaning of products.quantity.
 */
export const getPackageStockDeduction = (product: PackageUnitProductLike, selectedUnit: string, soldQuantity: number) => {
  const quantity = Math.max(0, Number(soldQuantity) || 0);
  if (isConfiguredBulkUnit(product, selectedUnit)) {
    return quantity * getUnitsPerBulk(product) / getContentsPerPackage(product);
  }
  return isOuterPackageUnit(product, selectedUnit) ? quantity : quantity / getContentsPerPackage(product);
};

/** Returns the server-configured fixed bulk-unit price, otherwise preserves the
 * existing content/outer-package price conversion.
 */
export const getSalePriceForUnit = (product: PackageUnitProductLike, contentUnitPrice: number, selectedUnit: string) => {
  if (isConfiguredBulkUnit(product, selectedUnit)) return Math.max(0, Number(product.bulkUnitPrice) || 0);
  const price = Math.max(0, Number(contentUnitPrice) || 0);
  return isOuterPackageUnit(product, selectedUnit) ? price * getContentsPerPackage(product) : price;
};

/** Product loyalty values are per content unit; a bulk package contains several such units. */
export const getLoyaltyPointsForSaleUnit = (product: PackageUnitProductLike, pointsPerContentUnit: number, selectedUnit: string) => {
  const points = Math.max(0, Number(pointsPerContentUnit) || 0);
  return isConfiguredBulkUnit(product, selectedUnit) ? points * getUnitsPerBulk(product) : points;
};
