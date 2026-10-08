import { buildSalesInventoryEntries, type SalesInventoryCatalogOrder, type SalesInventoryProduct, type SalesInventoryRecipe, type SalesInventorySale } from "./salesInventory";

export type LoyaltyCustomerRecord = {
  name: string;
  customerCode: string;
  phone?: string;
  points: number;
  transactions?: Array<{ id: string; points: number; source: string; description: string; createdAt: string }>;
};

export type LoyaltyRewardRecord = { points: number; giftName: string; giftCost?: number; confirmed?: boolean };
export type GiftDeliveryRecord = { customerCode?: string; customerName: string; customerPhone?: string; giftName: string; pointsDeducted: number; giftCost?: number; date: string };

type CustomerSale = SalesInventorySale & { customerName?: string; customerPhone?: string; customerCode?: string };

export type CustomerProfitabilityRow = {
  customerCode: string;
  name: string;
  phone: string;
  currentPoints: number;
  earnedPoints: number;
  purchaseCount: number;
  revenue: number;
  cost: number;
  grossProfit: number;
  deliveredGiftCost: number;
  unknownGiftCostCount: number;
  netProfitAfterGifts: number;
  products: Array<{ name: string; quantity: number; revenue: number; cost: number; profit: number; points: number }>;
  gifts: Array<{ giftName: string; pointsDeducted: number; giftCost: number; giftCostKnown: boolean; date: string }>;
  currentReward?: LoyaltyRewardRecord;
  nextReward?: LoyaltyRewardRecord;
  pointsToNextReward: number;
};

const money = (value: number) => Number(value.toFixed(2));
const safePoints = (value: unknown) => Math.max(0, Math.trunc(Number(value) || 0));
const normalize = (value?: string | null) => String(value || "").trim().toLowerCase();

function customerKey(input: { customerCode?: string; phone?: string; name?: string }) {
  return input.customerCode?.trim() || (input.phone?.trim() ? `phone:${input.phone.trim()}` : `name:${normalize(input.name)}`);
}

export function buildCustomerProfitabilityReport(input: {
  sales: CustomerSale[];
  catalogOrders?: Array<SalesInventoryCatalogOrder & { customerName?: string; customerPhone?: string; customerCode?: string }>;
  products: SalesInventoryProduct[];
  recipes: SalesInventoryRecipe[];
  customers: LoyaltyCustomerRecord[];
  rewards: LoyaltyRewardRecord[];
  giftDeliveries?: GiftDeliveryRecord[];
}): CustomerProfitabilityRow[] {
  const directEntries = buildSalesInventoryEntries({ sales: input.sales, catalogOrders: [], products: input.products, recipes: input.recipes });
  const catalogOrders = (input.catalogOrders || []).filter(order => order.status === "delivered" && !order.archivedAt);
  const catalogEntries = buildSalesInventoryEntries({ sales: [], catalogOrders, products: input.products, recipes: input.recipes });
  const salesByInvoice = new Map<string, CustomerSale>();
  input.sales.forEach(sale => salesByInvoice.set(String(sale.id), sale));
  const ordersByInvoice = new Map<string, (typeof catalogOrders)[number]>();
  catalogOrders.forEach(order => ordersByInvoice.set(`CAT-${order.id}`, order));
  const grouped = new Map<string, CustomerProfitabilityRow>();
  const countedInvoices = new Map<string, Set<string>>();
  const findOrCreate = (identity: { customerCode?: string; customerPhone?: string; customerName?: string }) => {
    const key = customerKey({ customerCode: identity.customerCode, phone: identity.customerPhone, name: identity.customerName });
    const known = input.customers.find(customer => customerKey({ customerCode: customer.customerCode, phone: customer.phone, name: customer.name }) === key);
    const existing = grouped.get(key);
    if (existing) return existing;
    const row: CustomerProfitabilityRow = { customerCode: known?.customerCode || identity.customerCode || "", name: known?.name || identity.customerName || "عميل غير مسمى", phone: known?.phone || identity.customerPhone || "", currentPoints: Number(known?.points || 0), earnedPoints: 0, purchaseCount: 0, revenue: 0, cost: 0, grossProfit: 0, deliveredGiftCost: 0, unknownGiftCostCount: 0, netProfitAfterGifts: 0, products: [], gifts: [], pointsToNextReward: 0 };
    grouped.set(key, row);
    return row;
  };
  const addEntries = (entries: ReturnType<typeof buildSalesInventoryEntries>) => entries.forEach(entry => {
    const source = entry.source === "catalog" ? ordersByInvoice.get(entry.invoiceId) : salesByInvoice.get(entry.invoiceId);
    if (!source) return;
    const customer = entry.source === "catalog"
      ? { customerCode: source.customerCode, customerPhone: source.customerPhone, customerName: source.customerName }
      : { customerCode: source.customerCode, customerPhone: source.customerPhone, customerName: source.customerName };
    if (!customer.customerCode && !customer.customerPhone && !customer.customerName) return;
    const row = findOrCreate(customer);
    const pointsPerUnit = safePoints(entry.loyaltyPoints);
    const points = pointsPerUnit * safePoints(entry.quantity);
    const key = customerKey({ customerCode: customer.customerCode, phone: customer.customerPhone, name: customer.customerName });
    const invoices = countedInvoices.get(key) || new Set<string>();
    if (!invoices.has(entry.invoiceId)) {
      row.purchaseCount += 1;
      invoices.add(entry.invoiceId);
      countedInvoices.set(key, invoices);
    }
    row.revenue = money(row.revenue + entry.revenue);
    row.cost = money(row.cost + entry.cost);
    row.grossProfit = money(row.grossProfit + entry.profit);
    row.earnedPoints += points;
    const product = row.products.find(item => item.name === entry.name);
    if (product) {
      product.quantity += entry.quantity;
      product.revenue = money(product.revenue + entry.revenue);
      product.cost = money(product.cost + entry.cost);
      product.profit = money(product.profit + entry.profit);
      product.points += points;
    } else {
      row.products.push({ name: entry.name, quantity: entry.quantity, revenue: entry.revenue, cost: entry.cost, profit: entry.profit, points });
    }
  });
  addEntries(directEntries);
  addEntries(catalogEntries);

  const countInvoiceForCustomer = (invoiceId: string, identity: { customerCode?: string; customerPhone?: string; customerName?: string }) => {
    if (!identity.customerCode && !identity.customerPhone && !identity.customerName) return;
    const row = findOrCreate(identity);
    const key = customerKey({ customerCode: identity.customerCode, phone: identity.customerPhone, name: identity.customerName });
    const invoices = countedInvoices.get(key) || new Set<string>();
    if (invoices.has(invoiceId)) return;
    row.purchaseCount += 1;
    invoices.add(invoiceId);
    countedInvoices.set(key, invoices);
  };
  input.sales.forEach(sale => countInvoiceForCustomer(String(sale.id), { customerCode: sale.customerCode, customerPhone: sale.customerPhone, customerName: sale.customerName }));
  catalogOrders.forEach(order => countInvoiceForCustomer(`CAT-${order.id}`, { customerCode: order.customerCode, customerPhone: order.customerPhone, customerName: order.customerName }));

  input.customers.forEach(customer => {
    const row = findOrCreate({ customerCode: customer.customerCode, customerPhone: customer.phone, customerName: customer.name });
    row.currentPoints = Number(customer.points || 0);
    row.earnedPoints = customer.transactions?.filter(tx => tx.points > 0 && (tx.source === "sale" || tx.source === "catalog" || tx.source === "offer")).reduce((sum, tx) => sum + Number(tx.points || 0), 0) || row.earnedPoints;
  });
  (input.giftDeliveries || []).forEach(gift => {
    const row = findOrCreate({ customerCode: gift.customerCode, customerPhone: gift.customerPhone, customerName: gift.customerName });
    const giftCostKnown = gift.giftCost !== undefined && gift.giftCost !== null && String(gift.giftCost).trim() !== "" && Number.isFinite(Number(gift.giftCost));
    const giftCost = giftCostKnown ? Math.max(0, Number(gift.giftCost)) : 0;
    row.gifts.push({ giftName: gift.giftName, pointsDeducted: safePoints(gift.pointsDeducted), giftCost, giftCostKnown, date: gift.date });
    if (giftCostKnown) row.deliveredGiftCost = money(row.deliveredGiftCost + giftCost);
    else row.unknownGiftCostCount += 1;
  });

  const rewards = input.rewards.filter(reward => reward.confirmed !== false && safePoints(reward.points) > 0).sort((a, b) => a.points - b.points);
  grouped.forEach(row => {
    row.currentReward = [...rewards].reverse().find(reward => row.currentPoints >= reward.points);
    row.nextReward = rewards.find(reward => reward.points > row.currentPoints);
    row.pointsToNextReward = row.nextReward ? Math.max(0, row.nextReward.points - row.currentPoints) : 0;
    row.netProfitAfterGifts = money(row.grossProfit - row.deliveredGiftCost);
    row.products.sort((a, b) => b.points - a.points);
  });
  return Array.from(grouped.values()).sort((a, b) => b.netProfitAfterGifts - a.netProfitAfterGifts || b.currentPoints - a.currentPoints);
}
