import { getActiveShopContext, listProductCategories, listProductsPage } from "./products";
import type { CloudProduct, ProductCursor } from "./products";
import { getSupabaseClient, requireCloudResult } from "./client";
import { listCloudFormulations } from "./formulations";

export type InventorySectionKey = "formulations" | "products" | "apartment" | "materials";

export type InventoryValuationItem = {
  id: string;
  name: string;
  section: InventorySectionKey;
  sectionName: string;
  category: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitSalePrice: number;
  capital: number;
  expectedSales: number;
  expectedProfit: number;
  marginPercent: number;
  details?: string;
};

export type InventoryTotals = {
  capital: number;
  expectedSales: number;
  expectedProfit: number;
  marginPercent: number;
  itemCount: number;
};

export type InventoryValuationSnapshot = {
  shopId: string;
  calculatedAt: string;
  items: InventoryValuationItem[];
  categories: string[];
  sections: Record<InventorySectionKey, InventoryTotals>;
  totals: InventoryTotals;
};

export const INVENTORY_SECTIONS: Array<{ key: InventorySectionKey; title: string; description: string }> = [
  { key: "formulations", title: "التركيبات ومنتجات رجوة المصنعة", description: "الرصيد السحابي المقدر من الإنتاج المكتمل بعد خصم المبيعات وإضافة المرتجعات." },
  { key: "products", title: "منتجات الكتالوج والجاهز", description: "أرصدة المنتجات المسجلة في المتجر وفئاتها الفعلية." },
  { key: "apartment", title: "مخزن الشقة", description: "الكراتين/الوحدات والقطع الإضافية بتكلفتها وقيمتها القطاعية." },
  { key: "materials", title: "الخامات والكيماويات", description: "قيمة الخامات المحبوسة حسب الوزن والوحدة والسعر المسجل، دون تحويل وحدات." },
];

const PAGE_SIZE = 500;
const cleanNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

type ValuationItemInput = Omit<InventoryValuationItem, "capital" | "expectedSales" | "expectedProfit" | "marginPercent"> & { capitalOnly?: boolean };

export function createInventoryValuationItem(input: ValuationItemInput): InventoryValuationItem {
  const { capitalOnly = false, ...itemInput } = input;
  const quantity = cleanNumber(input.quantity);
  const unitCost = cleanNumber(input.unitCost);
  const unitSalePrice = cleanNumber(input.unitSalePrice);
  const capital = quantity * unitCost;
  const expectedSales = quantity * unitSalePrice;
  const expectedProfit = capitalOnly ? 0 : expectedSales - capital;
  return {
    ...itemInput,
    quantity,
    unitCost,
    unitSalePrice,
    capital,
    expectedSales,
    expectedProfit,
    marginPercent: expectedSales > 0 ? (expectedProfit / expectedSales) * 100 : 0,
  };
}

const makeItem = createInventoryValuationItem;

export function summarizeInventory(items: InventoryValuationItem[]): InventoryTotals {
  const total = items.reduce((result, item) => ({
    capital: result.capital + item.capital,
    expectedSales: result.expectedSales + item.expectedSales,
    expectedProfit: result.expectedProfit + item.expectedProfit,
    itemCount: result.itemCount + 1,
  }), { capital: 0, expectedSales: 0, expectedProfit: 0, itemCount: 0 });
  return {
    ...total,
    marginPercent: total.expectedSales > 0 ? (total.expectedProfit / total.expectedSales) * 100 : 0,
  };
}

export function calculateApartmentValuation(input: {
  quantity: number;
  extraPieces: number;
  piecesPerUnit: number;
  wholesalePrice: number;
  retailPrice: number;
}) {
  const quantity = cleanNumber(input.quantity);
  const extraPieces = cleanNumber(input.extraPieces);
  const piecesPerUnit = cleanNumber(input.piecesPerUnit);
  const equivalentUnits = quantity + (piecesPerUnit > 0 ? extraPieces / piecesPerUnit : 0);
  return {
    equivalentUnits,
    capital: quantity * cleanNumber(input.wholesalePrice) + (piecesPerUnit > 0 ? extraPieces * cleanNumber(input.wholesalePrice) / piecesPerUnit : 0),
    expectedSales: quantity * cleanNumber(input.retailPrice) + (piecesPerUnit > 0 ? extraPieces * cleanNumber(input.retailPrice) / piecesPerUnit : 0),
  };
}

export function calculateRawMaterialValuation(input: {
  quantity: number;
  totalWeight: number;
  totalPrice: number;
  pricePerKilo: number;
}) {
  const weight = cleanNumber(input.totalWeight);
  const quantity = cleanNumber(input.quantity);
  const stockQuantity = weight > 0 ? weight : quantity;
  const recordedUnitCost = cleanNumber(input.pricePerKilo);
  const unitCost = recordedUnitCost > 0 ? recordedUnitCost : (stockQuantity > 0 ? cleanNumber(input.totalPrice) / stockQuantity : 0);
  return { quantity: stockQuantity, unitCost, capital: stockQuantity * unitCost };
}

export function calculateFormulationOnHand(produced: number, sold: number, returned: number): number {
  return Math.max(0, cleanNumber(produced) - cleanNumber(sold) + cleanNumber(returned));
}

async function fetchAllProducts(): Promise<CloudProduct[]> {
  const products: CloudProduct[] = [];
  let cursor: ProductCursor | null = null;
  do {
    const page = await listProductsPage({ cursor, limit: 100, includeImages: false });
    products.push(...page.items);
    if (!page.has_more) break;
    if (!page.next_cursor || (cursor && page.next_cursor.id === cursor.id && page.next_cursor.created_at === cursor.created_at)) {
      throw new Error("توقف ترقيم صفحات المنتجات قبل اكتمال قراءة المخزون.");
    }
    cursor = page.next_cursor;
  } while (cursor);
  return products;
}

async function fetchAllRawMaterials(shopId: string) {
  const client = getSupabaseClient();
  const rows: Array<{ id: string; name: string; supplier: string; unit: string; total_weight: number; quantity: number; total_price: number; price_per_kilo: number }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from("raw_materials")
      .select("id,name,supplier,unit,total_weight,quantity,total_price,price_per_kilo")
      .eq("shop_id", shopId).is("deleted_at", null).order("id").range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchAllApartmentItems(shopId: string) {
  const client = getSupabaseClient();
  const rows: Array<{ id: string; name: string; unit: string; pieces_per_unit: number; quantity: number; extra_pieces: number; wholesale_price: number; retail_price: number; category_name: string }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from("apartment_inventory_items")
      .select("id,name,unit,pieces_per_unit,quantity,extra_pieces,wholesale_price,retail_price,category_name")
      .eq("shop_id", shopId).order("id").range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchAllProductionRuns(shopId: string) {
  const client = getSupabaseClient();
  const rows: Array<{ id: string; recipe_id: string | null; recipe_name: string; quantity: number; status: string; produced_at: string }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from("production_runs")
      .select("id,recipe_id,recipe_name,quantity,status,produced_at")
      .eq("shop_id", shopId).order("produced_at").order("id").range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchAllFormulationSales(shopId: string) {
  const client = getSupabaseClient();
  const rows: Array<{ id: string; invoice_id: string; formulation_id: string | null; quantity: number }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from("invoice_items")
      .select("id,invoice_id,formulation_id,quantity")
      .eq("shop_id", shopId).not("formulation_id", "is", null)
      .order("created_at").order("id").range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchInvoiceStatuses(shopId: string, invoiceIds: string[]) {
  const client = getSupabaseClient();
  const result = new Map<string, string>();
  for (let offset = 0; offset < invoiceIds.length; offset += 250) {
    const batch = invoiceIds.slice(offset, offset + 250);
    const response = await client.from("invoices").select("id,status").eq("shop_id", shopId).in("id", batch).limit(batch.length);
    for (const invoice of requireCloudResult(response)) result.set(invoice.id, invoice.status);
  }
  return result;
}

async function fetchAllFormulationReturns(shopId: string) {
  const client = getSupabaseClient();
  const rows: Array<{ invoice_item_id: string; quantity: number }> = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await client.from("invoice_return_items")
      .select("invoice_item_id,quantity")
      .eq("shop_id", shopId).order("created_at").order("id").range(offset, offset + PAGE_SIZE - 1);
    const page = requireCloudResult(result);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

const normalizeName = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ar");
const positiveOrZero = (...values: Array<number | undefined>) => values.map(cleanNumber).find(value => value > 0) ?? 0;

export async function loadInventoryValuation(): Promise<InventoryValuationSnapshot> {
  const context = await getActiveShopContext();
  if (!( ["manager", "admin", "supervisor"] as string[]).includes(context.role)) {
    throw new Error("عرض التقييم المالي للمخزون متاح للإدارة والمشرفين فقط.");
  }
  const [products, productCategories, materials, apartmentItems, formulations, productionRuns, formulationSales] = await Promise.all([
    fetchAllProducts(), listProductCategories(), fetchAllRawMaterials(context.shopId), fetchAllApartmentItems(context.shopId),
    listCloudFormulations(), fetchAllProductionRuns(context.shopId), fetchAllFormulationSales(context.shopId),
  ]);
  const invoiceStatuses = await fetchInvoiceStatuses(context.shopId, Array.from(new Set(formulationSales.map(line => line.invoice_id))));
  const formulationReturns = await fetchAllFormulationReturns(context.shopId);
  const returnsByInvoiceItem = new Map<string, number>();
  for (const row of formulationReturns) returnsByInvoiceItem.set(row.invoice_item_id, (returnsByInvoiceItem.get(row.invoice_item_id) ?? 0) + cleanNumber(row.quantity));

  const soldByFormulation = new Map<string, { sold: number; returned: number }>();
  for (const line of formulationSales) {
    if (!line.formulation_id || invoiceStatuses.get(line.invoice_id) === "voided") continue;
    const balance = soldByFormulation.get(line.formulation_id) ?? { sold: 0, returned: 0 };
    balance.sold += cleanNumber(line.quantity);
    balance.returned += returnsByInvoiceItem.get(line.id) ?? 0;
    soldByFormulation.set(line.formulation_id, balance);
  }

  const producedByFormulation = new Map<string, number>();
  const formulationIdByName = new Map<string, string>();
  for (const formulation of formulations) formulationIdByName.set(normalizeName(formulation.name), formulation.id);
  for (const run of productionRuns) {
    if (run.status !== "completed") continue;
    const formulationId = run.recipe_id || formulationIdByName.get(normalizeName(run.recipe_name));
    if (!formulationId) continue;
    producedByFormulation.set(formulationId, (producedByFormulation.get(formulationId) ?? 0) + cleanNumber(run.quantity));
  }

  const categoryById = new Map(productCategories.map(category => [category.id, category.name]));
  const items: InventoryValuationItem[] = [];
  for (const product of products) {
    const unitCost = product.saleMode === "weight"
      ? positiveOrZero(product.costPerPiece, product.wholesalePricePerPiece, product.costPerUnit, product.wholesalePricePerUnit)
      : positiveOrZero(product.costPerUnit, product.wholesalePricePerUnit, product.costPerPiece, product.wholesalePricePerPiece);
    const category = (product.categoryId && categoryById.get(product.categoryId)) || product.category || "بدون فئة";
    items.push(makeItem({
      id: `product:${product.id}`, name: product.name, section: "products", sectionName: "منتجات الكتالوج والجاهز", category,
      quantity: product.quantity, unit: product.unit || "وحدة", unitCost, unitSalePrice: product.retailPrice,
    }));
  }

  for (const formulation of formulations) {
    const movement = soldByFormulation.get(formulation.id) ?? { sold: 0, returned: 0 };
    const quantity = calculateFormulationOnHand(producedByFormulation.get(formulation.id) ?? 0, movement.sold, movement.returned);
    items.push(makeItem({
      id: `formulation:${formulation.id}`, name: formulation.name, section: "formulations", sectionName: "التركيبات ومنتجات رجوة المصنعة", category: "التركيبات",
      quantity, unit: formulation.productionUnit || "وحدة", unitCost: formulation.costPerUnit, unitSalePrice: formulation.salePrice,
      details: "الرصيد مقدر من سجلات الإنتاج المكتملة ومبيعات/مرتجعات التركيبات السحابية.",
    }));
  }

  for (const item of apartmentItems) {
    const valuation = calculateApartmentValuation({ quantity: item.quantity, extraPieces: item.extra_pieces, piecesPerUnit: item.pieces_per_unit, wholesalePrice: item.wholesale_price, retailPrice: item.retail_price });
    const unitCost = valuation.equivalentUnits > 0 ? valuation.capital / valuation.equivalentUnits : cleanNumber(item.wholesale_price);
    const unitSalePrice = valuation.equivalentUnits > 0 ? valuation.expectedSales / valuation.equivalentUnits : cleanNumber(item.retail_price);
    items.push(makeItem({
      id: `apartment:${item.id}`, name: item.name, section: "apartment", sectionName: "مخزن الشقة", category: item.category_name || "بدون فئة",
      quantity: valuation.equivalentUnits, unit: item.unit || "وحدة", unitCost, unitSalePrice,
      details: `${cleanNumber(item.quantity)} ${item.unit || "وحدة"} + ${cleanNumber(item.extra_pieces)} قطعة إضافية${item.pieces_per_unit > 0 ? ` (كل وحدة ${cleanNumber(item.pieces_per_unit)} قطعة)` : ""}`,
    }));
  }

  for (const material of materials) {
    const valuation = calculateRawMaterialValuation({ quantity: material.quantity, totalWeight: material.total_weight, totalPrice: material.total_price, pricePerKilo: material.price_per_kilo });
    items.push(makeItem({
      id: `material:${material.id}`, name: material.name, section: "materials", sectionName: "الخامات والكيماويات", category: "الخامات",
      quantity: valuation.quantity, unit: material.unit || "وحدة", unitCost: valuation.unitCost, unitSalePrice: 0,
      details: material.supplier ? `المورد: ${material.supplier}` : "محتسبة حسب الكمية والوحدة المسجلتين.",
      capitalOnly: true,
    }));
  }

  const sections = Object.fromEntries(INVENTORY_SECTIONS.map(section => [section.key, summarizeInventory(items.filter(item => item.section === section.key))])) as Record<InventorySectionKey, InventoryTotals>;
  const categories = Array.from(new Set([...productCategories.map(category => category.name), ...items.map(item => item.category).filter(Boolean)]))
    .filter(name => items.some(item => item.category === name))
    .sort((left, right) => left.localeCompare(right, "ar"));
  return { shopId: context.shopId, calculatedAt: new Date().toISOString(), items, categories, sections, totals: summarizeInventory(items) };
}

export function subscribeInventoryValuationChanges(shopId: string, onChange: () => void) {
  const client = getSupabaseClient();
  const tables: Array<[string, string]> = [
    ["products", "shop_id"], ["product_categories", "shop_id"], ["raw_materials", "shop_id"],
    ["recipes", "shop_id"], ["recipe_ingredients", "shop_id"], ["production_runs", "shop_id"],
    ["invoices", "shop_id"], ["invoice_items", "shop_id"], ["invoice_return_items", "shop_id"],
    ["apartment_inventory_items", "shop_id"], ["apartment_inventory_categories", "shop_id"],
  ];
  let channel = client.channel(`inventory-valuation:${shopId}`);
  for (const [table, column] of tables) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `${column}=eq.${shopId}` }, onChange);
  }
  channel.subscribe();
  return () => client.removeChannel(channel);
}
