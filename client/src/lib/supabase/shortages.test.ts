import { describe, expect, it } from "vitest";
import { mapShortageRow, normalizeManualProductNames, toShortagePayload } from "./shortages";
import type { Database } from "./database.types";

type ShortageRow = Database["public"]["Tables"]["shortage_items"]["Row"];

const row: ShortageRow = {
  id: "4d64213a-28d9-4c27-9f9b-44d94f09c438",
  shop_id: "a9a967c1-9f03-4a4a-81ab-7f6c8743c032",
  product_id: "cc4c0bda-d0d2-4950-ad61-0cff5f6195d7",
  product_name_snapshot: "صابون",
  current_quantity: 2,
  min_quantity: 5,
  shortage: 3,
  unit: "علبة",
  reported_at: "2026-10-09T00:00:00.000Z",
  status: "pending",
  notes: "",
  category: "منظفات",
  version: 2,
  created_by: null,
  created_at: "2026-10-09T00:00:00.000Z",
  updated_at: "2026-10-09T00:00:00.000Z",
  deleted_at: null,
};

describe("cloud shortages contract", () => {
  it("maps the server-generated shortage and version without using browser persistence", () => {
    expect(mapShortageRow(row)).toMatchObject({
      id: row.id,
      version: 2,
      productName: "صابون",
      currentQuantity: 2,
      minQuantity: 5,
      shortage: 3,
      status: "pending",
      category: "منظفات",
    });
  });

  it("trims and validates a shortage write payload", () => {
    expect(toShortagePayload({
      productId: row.product_id!,
      productName: " صابون ",
      currentQuantity: 2,
      minQuantity: 5,
      unit: " علبة ",
      status: "ordered",
      notes: " يلزم الطلب ",
      category: " منظفات ",
    })).toMatchObject({ product_name_snapshot: "صابون", current_quantity: 2, min_quantity: 5, status: "ordered", notes: "يلزم الطلب", category: "منظفات" });
    expect(() => toShortagePayload({ productId: "", productName: "", currentQuantity: -1, minQuantity: 5, unit: "", status: "pending", notes: "", category: "" })).toThrow();
  });

  it("normalizes a manual product list, removes case-insensitive duplicates, and caps its size", () => {
    expect(normalizeManualProductNames([" صابون ", "صابون", "", "كلور"])).toEqual(["صابون", "كلور"]);
    expect(normalizeManualProductNames(Array.from({ length: 510 }, (_, i) => `منتج ${i}`))).toHaveLength(500);
  });
});
