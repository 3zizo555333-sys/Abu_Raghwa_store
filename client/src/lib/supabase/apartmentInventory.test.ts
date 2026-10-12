import { describe, expect, it } from "vitest";
import { mapApartmentInventoryItem, toApartmentInventoryPayload } from "./apartmentInventory";
import type { ApartmentInventoryInput } from "./apartmentInventory";

const baseInput: ApartmentInventoryInput = {
  name: "  منظف أرضيات  ",
  supplier: "  المورد  ",
  location: "  الرف 3  ",
  unit: "كرتونة",
  piecesPerUnit: 12,
  quantity: 4,
  extraPieces: 2,
  wholesalePrice: 96,
  retailPrice: 11,
  wholesaleRetailPrice: 9.5,
  category: "  منظفات  ",
};

describe("Apartment inventory cloud boundary", () => {
  it("maps the persisted shop inventory row into the screen model", () => {
    const item = mapApartmentInventoryItem({
      id: "item-1", shop_id: "shop-1", name: "منظف", supplier: "مورد", location: "رف 2", unit: "كرتونة",
      pieces_per_unit: 12, quantity: 4, extra_pieces: 2, wholesale_price: 96, retail_price: 11,
      wholesale_retail_price: 9.5, category_name: "منظفات", created_at: "2026-10-12T10:00:00Z", updated_at: "2026-10-12T10:10:00Z",
    });

    expect(item).toMatchObject({
      id: "item-1", name: "منظف", supplier: "مورد", quantity: 4, extraPieces: 2,
      wholesalePrice: 96, retailPrice: 11, wholesaleRetailPrice: 9.5, category: "منظفات",
    });
    expect(item.updatedAt).toBe("2026-10-12T10:10:00Z");
  });

  it("trims text and maps quantity, purchase cost, retail and wholesale prices", () => {
    expect(toApartmentInventoryPayload(baseInput)).toMatchObject({
      name: "منظف أرضيات", supplier: "المورد", location: "الرف 3", unit: "كرتونة",
      pieces_per_unit: 12, quantity: 4, extra_pieces: 2, wholesale_price: 96,
      retail_price: 11, wholesale_retail_price: 9.5, category_name: "منظفات",
    });
  });

  it("supports partial quantity/price updates without adding a shop id", () => {
    const payload = toApartmentInventoryPayload({ quantity: 8, wholesalePrice: 120, retailPrice: 15, wholesaleRetailPrice: 12 });
    expect(payload).toEqual({ quantity: 8, wholesale_price: 120, retail_price: 15, wholesale_retail_price: 12 });
    expect(payload).not.toHaveProperty("shop_id");
  });

  it("rejects blank names/categories and negative or non-finite stock/prices", () => {
    expect(() => toApartmentInventoryPayload({ name: "  " })).toThrow("اسم المنتج مطلوب");
    expect(() => toApartmentInventoryPayload({ category: "  " })).toThrow("الفئة مطلوبة");
    expect(() => toApartmentInventoryPayload({ quantity: -1 })).toThrow("غير سالب");
    expect(() => toApartmentInventoryPayload({ retailPrice: Number.NaN })).toThrow("غير سالب");
  });
});
