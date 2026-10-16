import { describe, expect, it } from "vitest";
import { cleanTaskInsert, mapTaskRow, toDisplayStatus, toStoredStatus } from "./tasks";

describe("cloud tasks", () => {
  it("maps a store_tasks row to the screen model", () => {
    const task = mapTaskRow({
      id: "task-1", store_id: "shop-1", title: "تنظيف", description: null, priority: "high",
      status: "in_progress", due_date: "2026-10-20", assigned_to: "employee-1", points_value: 40,
      points_awarded: false, created_by: null, created_at: "2026-10-16T10:00:00Z", updated_at: "2026-10-16T10:00:00Z",
    });
    expect(task).toMatchObject({ id: "task-1", description: "", status: "in-progress", priority: "high", assignedTo: "employee-1", pointsValue: 40 });
  });

  it("normalizes status values in both directions", () => {
    expect(toStoredStatus("in-progress")).toBe("in_progress");
    expect(toDisplayStatus("in_progress")).toBe("in-progress");
    expect(toDisplayStatus("completed")).toBe("completed");
  });

  it("trims and validates insert payload without trusting display names", () => {
    expect(cleanTaskInsert({ title: "  مهمة  ", description: " وصف ", assignedTo: "employee-1", dueDate: "", priority: "medium", pointsValue: 12 })).toEqual({
      title: "مهمة", description: "وصف", assigned_to: "employee-1", due_date: null, priority: "medium", status: "pending", points_value: 12, points_awarded: false,
    });
    expect(() => cleanTaskInsert({ title: "", assignedTo: "employee-1", priority: "medium", pointsValue: 1 })).toThrow("اكتب اسم المهمة");
    expect(() => cleanTaskInsert({ title: "مهمة", assignedTo: "", priority: "medium", pointsValue: 1 })).toThrow("اختر الموظف");
  });
});
