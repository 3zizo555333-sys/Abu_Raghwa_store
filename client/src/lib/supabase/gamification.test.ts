import { describe, expect, it } from "vitest";
import { mapGamificationEmployees } from "./gamification";

describe("cloud staff gamification", () => {
  it("aggregates task earnings, penalties, and redeemed rewards from the ledger", () => {
    const rewards = [{ id: "r1", store_id: "shop", title: "هدية", description: "وصف", points_required: 100, available_quantity: 1, icon: "🎁", created_at: "2026-10-16T09:00:00Z" }];
    const employees = mapGamificationEmployees([{ id: "e1", name: "أحمد", created_at: "2026-10-01T00:00:00Z" }], [
      { id: "l1", store_id: "shop", employee_id: "e1", points_delta: 150, entry_type: "task_earned", source_id: "task:t1", description: "إكمال المهمة", created_by: null, created_at: "2026-10-16T10:00:00Z" },
      { id: "l2", store_id: "shop", employee_id: "e1", points_delta: -20, entry_type: "penalty", source_id: "penalty:p1", description: "مخالفة", created_by: null, created_at: "2026-10-16T11:00:00Z" },
      { id: "l3", store_id: "shop", employee_id: "e1", points_delta: -100, entry_type: "reward_redeemed", source_id: "reward:r1", description: "استلام الجائزة: هدية", created_by: null, created_at: "2026-10-16T12:00:00Z" },
    ], rewards);
    expect(employees[0]).toMatchObject({ id: "e1", currentPoints: 30, rewards });
    expect(employees[0].claimedRewards).toHaveLength(1);
    expect(employees[0].pointHistory[0].type).toBe("deduction");
  });
});
