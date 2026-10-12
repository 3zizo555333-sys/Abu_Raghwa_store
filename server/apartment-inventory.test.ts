import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(join(root, "supabase/migrations/20261012105000_apartment_inventory_cloud.sql"), "utf8");
const service = readFileSync(join(root, "client/src/lib/supabase/apartmentInventory.ts"), "utf8");
const page = readFileSync(join(root, "client/src/pages/ApartmentManagement.tsx"), "utf8");

describe("Cloud-backed apartment inventory contract", () => {
  it("loads persisted item and category rows scoped to the active shop", () => {
    expect(service).toContain('.eq("shop_id", shopId)');
    expect(service).toContain("fetchAllItems(shopId)");
    expect(service).toContain("fetchAllCategories(shopId)");
    expect(service).toContain(".range(offset, offset + PAGE_SIZE - 1)");
  });

  it("persists individual and bulk writes and uses server-confirmed results", () => {
    expect(page).toContain("await createCloudApartmentItems([formData])");
    expect(page).toContain("await createCloudApartmentItems(names.map(name =>");
    expect(page).toContain("await updateCloudApartmentItem(id, patch, currentItem.updatedAt)");
    expect(page).toContain("await updateCloudApartmentItem(editingItem.id, editFormData, editingItem.updatedAt)");
    expect(page).toContain("await updateCloudApartmentItemsCategory(selectedItemIds, savedCategory)");
    expect(page).toContain("await deleteCloudApartmentItems(selectedItemIds)");
    expect(page).toContain("await listCloudApartmentInventory()");
    expect(page).not.toMatch(/browserState|localStorage|sessionStorage/);
  });

  it("uses forced, shop-scoped RLS and protects purchase-cost reads and deletes", () => {
    expect(migration.match(/force row level security/gi)).toHaveLength(2);
    expect(migration).toMatch(/apartment_inventory_items_member_read[\s\S]*?using \(public\.has_shop_role\(shop_id, array\['manager','admin','supervisor'\]/i);
    expect(migration).toMatch(/apartment_inventory_items_manager_insert[\s\S]*?with check \(public\.has_shop_role\(shop_id, array\['manager','admin','supervisor'\]/i);
    expect(migration).toMatch(/apartment_inventory_items_manager_delete[\s\S]*?using \(public\.has_shop_role\(shop_id, array\['manager','admin'\]/i);
    expect(migration).toMatch(/grant update \(name, supplier, location, unit, pieces_per_unit, quantity, extra_pieces, wholesale_price, retail_price, wholesale_retail_price, category_name\)[\s\S]*?on public\.apartment_inventory_items/i);
    expect(migration).not.toMatch(/using\s*\(\s*true\s*\)|with\s+check\s*\(\s*true\s*\)/i);
  });

  it("uses updated_at as a conflict guard and does not authorize moving an item to another shop", () => {
    expect(service).toContain('.eq("updated_at", expectedUpdatedAt)');
    expect(service).toContain('.eq("shop_id", shopId)');
    expect(migration).not.toMatch(/grant update \([^)]*shop_id/i);
  });
});
