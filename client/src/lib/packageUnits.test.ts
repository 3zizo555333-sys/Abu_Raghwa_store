import { describe, expect, it } from "vitest";
import {
  getLoyaltyPointsForSaleUnit,
  getPackageStockDeduction,
  getSalePriceForUnit,
  getSaleUnitOptions,
} from "./packageUnits";

const product = {
  unit: "باكيت",
  contentUnit: "قطعة",
  unitsPerPackage: 12,
  bulkUnitName: "كرتونة",
  unitsPerBulk: 24,
  bulkUnitPrice: 250,
};

describe("bulk packaging units", () => {
  it("offers the configured large unit and prices it at bulk_unit_price", () => {
    expect(getSaleUnitOptions(product)).toEqual(["قطعة", "كرتونة"]);
    expect(getSalePriceForUnit(product, 15, "قطعة")).toBe(15);
    expect(getSalePriceForUnit(product, 15, "كرتونة")).toBe(250);
  });

  it("converts piece consumption into the existing package-based stock unit", () => {
    expect(getPackageStockDeduction(product, "كرتونة", 2)).toBe(4);
    expect(getPackageStockDeduction(product, "قطعة", 12)).toBe(1);
    expect(getPackageStockDeduction(product, "باكيت", 2)).toBe(2);
  });

  it("scales per-piece loyalty points by the number of contents in the large unit", () => {
    expect(getLoyaltyPointsForSaleUnit(product, 0.5, "كرتونة")).toBe(12);
    expect(getLoyaltyPointsForSaleUnit(product, 0.5, "قطعة")).toBe(0.5);
  });

  it("does not expose an incomplete large unit for sale", () => {
    expect(getSaleUnitOptions({ ...product, bulkUnitPrice: null })).toEqual(["قطعة"]);
    expect(getSaleUnitOptions({ ...product, bulkUnitName: "قطعة" })).toEqual(["قطعة"]);
  });

  it("keeps wholesale unit switching available through the legacy package fields", () => {
    const existingProduct = { unit: "كرتونة", contentUnit: "قطعة", unitsPerPackage: 12 };
    expect(getSaleUnitOptions(existingProduct)).toEqual(["قطعة"]);
    expect(getSaleUnitOptions(existingProduct, true)).toEqual(["قطعة", "كرتونة"]);
  });
});
