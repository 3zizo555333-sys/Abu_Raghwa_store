export type ProductCategoryRole = "manager" | "admin" | "supervisor" | "seller" | null | undefined;

export function getProductCategoryPermissions(role: ProductCategoryRole) {
  const canManage = role === "manager" || role === "admin" || role === "supervisor";
  return {
    canManage,
    canDelete: role === "manager" || role === "admin",
  };
}
