import { describe, expect, it } from "vitest";
import {
  buildArchivedItemGroups,
  findArchivedItemGroup,
  getPriceIncreaseAlert,
  getSavingsOpportunities,
  normalizeSupplierItemName,
} from "./supplierInvoiceAdvisor";

const invoices = [
  {
    id: "new",
    supplier_id: "supplier-a",
    supplier_name: "المورد أ",
    invoice_date: "2026-11-10",
    created_at: "2026-11-10T10:00:00Z",
    items: [{ item_name: "زيت أ́لفا 1 ك", unit_cost: 120, quantity: 2 }],
  },
  {
    id: "old-a",
    supplier_id: "supplier-a",
    supplier_name: "المورد أ",
    invoice_date: "2026-10-10",
    created_at: "2026-10-10T10:00:00Z",
    items: [{ item_name: "زيت ألفا 1 كيلو", unit_cost: 100, quantity: 2 }],
  },
  {
    id: "old-b",
    supplier_id: "supplier-b",
    supplier_name: "المورد ب",
    invoice_date: "2026-10-12",
    created_at: "2026-10-12T10:00:00Z",
    items: [{ item_name: "زيت الفه 1 كجم", unit_cost: 90, quantity: 2 }],
  },
];

describe("supplier invoice smart price advisor", () => {
  it("normalizes Arabic hamza, spacing, Arabic digits, and kilo abbreviations", () => {
    expect(normalizeSupplierItemName("زَيْت أ́لفا ١ كجم")).toBe(normalizeSupplierItemName(" زيت   الفا 1 كيلو "));
    expect(normalizeSupplierItemName("أرز ٢ ك")).toBe("ارز 2 كيلو");
  });

  it("groups fuzzy item spellings across saved supplier invoices", () => {
    const groups = buildArchivedItemGroups(invoices);
    expect(groups).toHaveLength(1);
    expect(findArchivedItemGroup("زيت ألفا 1 كيلو", groups)?.rows).toHaveLength(3);
    expect(findArchivedItemGroup("زيت الفه 1 كيلو", groups)?.rows).toHaveLength(3);
  });

  it("detects price increases between the newest and previous distinct invoices", () => {
    const group = buildArchivedItemGroups(invoices)[0];
    const alert = getPriceIncreaseAlert(group);
    expect(alert?.increase).toBe(30);
    expect(alert?.percent).toBeCloseTo(33.333, 2);
    expect(alert?.previous.unitCost).toBe(90);
    expect(alert?.latest.unitCost).toBe(120);
  });

  it("reports a cheaper alternative supplier using each supplier's latest saved price", () => {
    const opportunity = getSavingsOpportunities(buildArchivedItemGroups(invoices))[0];
    expect(opportunity).toMatchObject({
      current: { supplierKey: "id:supplier-a", unitCost: 120 },
      alternative: { supplierKey: "id:supplier-b", unitCost: 90 },
      savingPerUnit: 30,
    });
  });

  it("does not fuzzy-match different package sizes", () => {
    const groups = buildArchivedItemGroups(invoices);
    expect(findArchivedItemGroup("زيت ألفا 2 كيلو", groups)).toBeUndefined();
  });
});
