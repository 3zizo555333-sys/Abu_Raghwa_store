import { describe, expect, it } from "vitest";
import { getProductCategoryPermissions } from "./productCategoryPermissions";

describe("product category permissions", () => {
  it("allows managers, admins, and supervisors to create and edit categories", () => {
    for (const role of ["manager", "admin", "supervisor"] as const) {
      expect(getProductCategoryPermissions(role).canManage).toBe(true);
    }
  });

  it("limits category deletion to managers and admins, matching the RLS policy", () => {
    expect(getProductCategoryPermissions("manager").canDelete).toBe(true);
    expect(getProductCategoryPermissions("admin").canDelete).toBe(true);
    expect(getProductCategoryPermissions("supervisor").canDelete).toBe(false);
    expect(getProductCategoryPermissions("seller").canManage).toBe(false);
    expect(getProductCategoryPermissions(null).canManage).toBe(false);
  });
});
