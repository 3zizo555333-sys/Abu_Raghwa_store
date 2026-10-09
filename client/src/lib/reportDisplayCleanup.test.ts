import { describe, expect, it } from "vitest";
import { hideReportItem, parseHiddenReportItems, restoreReportItem } from "./reportDisplayCleanup";

describe("report display cleanup", () => {
  it("stores the selected display item without touching the input list", () => {
    const original = [{ id: "payments:cash", label: "نقدًا" }];
    const next = hideReportItem(original, { id: "top-products:soap", label: "  صابون  " });
    expect(next).toEqual([
      { id: "payments:cash", label: "نقدًا" },
      { id: "top-products:soap", label: "صابون" },
    ]);
    expect(original).toHaveLength(1);
  });

  it("restores just one hidden display item", () => {
    const hidden = [
      { id: "summary:revenue", label: "الإيرادات" },
      { id: "payment:cash", label: "نقدًا" },
    ];
    expect(restoreReportItem(hidden, "summary:revenue")).toEqual([hidden[1]]);
    expect(hidden).toHaveLength(2);
  });

  it("ignores malformed hidden-item storage safely", () => {
    expect(parseHiddenReportItems("not-json")).toEqual([]);
    expect(parseHiddenReportItems("{}" )).toEqual([]);
    expect(parseHiddenReportItems(JSON.stringify([{ id: "valid", label: "سليم" }, { id: 4, label: "غير صالح" }]))).toEqual([
      { id: "valid", label: "سليم" },
    ]);
  });
});
