import { describe, expect, it } from "vitest";
import { calculateExpenseSummaryFallback } from "./expenses";

describe("calculateExpenseSummaryFallback", () => {
  it("computes revenue, expenses, gross profit, and net profit from cloud rows", () => {
    const summary = calculateExpenseSummaryFallback(
      [{ total: 1000 }, { total: "500" }],
      [
        { quantity: 2, unit_cost_snapshot: 200 },
        { quantity: "1", unit_cost_snapshot: "100" },
      ],
      [{ amount: 120 }, { amount: "80" }],
    );

    expect(summary).toEqual({
      totalRevenue: 1500,
      totalExpenses: 200,
      totalProfit: 1000,
      netProfit: 800,
    });
  });

  it("returns zero totals for empty data without NaN", () => {
    expect(calculateExpenseSummaryFallback([], [], [])).toEqual({
      totalRevenue: 0,
      totalExpenses: 0,
      totalProfit: 0,
      netProfit: 0,
    });
  });
});
