export interface AdvisorInvoiceItem {
  item_name: string;
  unit_cost: number | string;
  quantity: number | string;
  barcode?: string | null;
}

export interface AdvisorInvoice {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  invoice_date: string;
  created_at?: string | null;
  items: AdvisorInvoiceItem[];
}

export interface ArchivedPricePoint {
  itemName: string;
  normalizedName: string;
  supplierKey: string;
  supplierName: string;
  unitCost: number;
  quantity: number;
  invoiceId: string;
  invoiceDate: string;
  createdAt: string;
}

export interface ArchivedItemGroup {
  key: string;
  itemName: string;
  aliases: string[];
  rows: ArchivedPricePoint[];
}

export interface PriceIncreaseAlert {
  itemName: string;
  latest: ArchivedPricePoint;
  previous: ArchivedPricePoint;
  increase: number;
  percent: number | null;
}

export interface SavingsOpportunity {
  itemName: string;
  current: ArchivedPricePoint;
  alternative: ArchivedPricePoint;
  savingPerUnit: number;
}

function toWesternDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function normalizeSupplierItemName(value: string): string {
  const normalized = toWesternDigits(value.normalize("NFKC").toLocaleLowerCase("ar"))
    .replace(/[\u0300-\u036F\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/كيلو[\s-]*(?:جرام|غرام|جم|غرامات)/g, "كيلو")
    .replace(/([0-9])\s*ك(?=\s|$)/g, "$1 كيلو")
    .replace(/[٠-٩۰-۹]/g, " ")
    .replace(/[^a-z0-9\u0600-\u06FF\s]/gi, " ");
  const units = new Set(["ك", "كجم", "كغ", "kg", "kgs", "kilo", "kilogram", "kilograms", "كيلوجرام", "كيلوغرام"]);
  return normalized.split(/\s+/).filter(Boolean).map(token => units.has(token) ? "كيلو" : token).join(" ");
}

function compactName(value: string): string {
  return value.replace(/\s+/g, "");
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

export function supplierItemNameSimilarity(left: string, right: string): number {
  const a = normalizeSupplierItemName(left);
  const b = normalizeSupplierItemName(right);
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;
  const numbersA = (a.match(/\d+(?:\.\d+)?/g) || []).sort().join(",");
  const numbersB = (b.match(/\d+(?:\.\d+)?/g) || []).sort().join(",");
  if (numbersA !== numbersB) return 0;
  const compactA = compactName(a);
  const compactB = compactName(b);
  const maxLength = Math.max(compactA.length, compactB.length);
  if (Math.min(compactA.length, compactB.length) < 4) return 0;
  const characterSimilarity = 1 - levenshteinDistance(compactA, compactB) / maxLength;
  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const overlap = Array.from(tokensA).filter(token => tokensB.has(token)).length;
  const tokenDice = (2 * overlap) / (tokensA.size + tokensB.size);
  if (characterSimilarity >= 0.82 || tokenDice >= 0.9) return Math.max(characterSimilarity, tokenDice);
  if (characterSimilarity >= 0.72 && tokenDice >= 0.7) return Math.max(characterSimilarity, tokenDice);
  return Math.max(characterSimilarity, tokenDice * 0.8);
}

function fuzzyIndexKeys(normalizedName: string): string[] {
  const compact = compactName(normalizedName);
  if (compact.length < 4) return [];
  const keys = new Set<string>();
  for (let index = 0; index < compact.length - 1; index += 1) keys.add(`g:${compact.slice(index, index + 2)}`);
  normalizedName.split(" ").filter(token => token.length >= 3).forEach(token => keys.add(`t:${token}`));
  return Array.from(keys);
}

export function buildArchivedItemGroups(invoices: AdvisorInvoice[]): ArchivedItemGroup[] {
  const variants = new Map<string, { rows: ArchivedPricePoint[]; nameCounts: Map<string, number> }>();
  for (const invoice of invoices) {
    const createdAt = invoice.created_at || invoice.invoice_date || "";
    const supplierName = invoice.supplier_name || "مورد غير معروف";
    const supplierKey = invoice.supplier_id
      ? `id:${invoice.supplier_id}`
      : `name:${normalizeSupplierItemName(supplierName) || supplierName.trim().toLocaleLowerCase("ar")}`;
    for (const item of invoice.items || []) {
      const itemName = String(item.item_name || "").trim();
      const normalizedName = normalizeSupplierItemName(itemName);
      const unitCost = Number(item.unit_cost);
      if (!itemName || !normalizedName || !Number.isFinite(unitCost) || unitCost < 0) continue;
      const entry = variants.get(normalizedName) || { rows: [], nameCounts: new Map<string, number>() };
      entry.rows.push({
        itemName,
        normalizedName,
        supplierKey,
        supplierName,
        unitCost,
        quantity: Number(item.quantity) || 0,
        invoiceId: invoice.id,
        invoiceDate: invoice.invoice_date || "",
        createdAt,
      });
      entry.nameCounts.set(itemName, (entry.nameCounts.get(itemName) || 0) + 1);
      variants.set(normalizedName, entry);
    }
  }

  const names = Array.from(variants.keys()).sort((a, b) => compactName(b).length - compactName(a).length || a.localeCompare(b, "ar"));
  const parents = names.map((_, index) => index);
  const findRoot = (index: number): number => {
    let current = index;
    while (parents[current] !== current) {
      parents[current] = parents[parents[current]];
      current = parents[current];
    }
    return current;
  };
  const join = (left: number, right: number) => {
    const leftRoot = findRoot(left);
    const rightRoot = findRoot(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const index = new Map<string, number[]>();
  names.forEach((name, currentIndex) => {
    const candidates = new Set<number>();
    fuzzyIndexKeys(name).forEach(key => (index.get(key) || []).forEach(candidate => candidates.add(candidate)));
    Array.from(candidates).forEach(candidate => {
      if (supplierItemNameSimilarity(name, names[candidate]) >= 0.82) join(currentIndex, candidate);
    });
    fuzzyIndexKeys(name).forEach(key => index.set(key, [...(index.get(key) || []), currentIndex]));
  });

  const grouped = new Map<number, { aliases: string[]; rows: ArchivedPricePoint[]; nameCounts: Map<string, number> }>();
  names.forEach((name, variantIndex) => {
    const root = findRoot(variantIndex);
    const group = grouped.get(root) || { aliases: [], rows: [], nameCounts: new Map<string, number>() };
    const variant = variants.get(name)!;
    group.aliases.push(name);
    group.rows.push(...variant.rows);
    variant.nameCounts.forEach((count, displayName) => group.nameCounts.set(displayName, (group.nameCounts.get(displayName) || 0) + count));
    grouped.set(root, group);
  });
  return Array.from(grouped.values()).map(group => {
    const itemName = Array.from(group.nameCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))[0]?.[0] || group.aliases[0];
    const aliases = Array.from(new Set<string>(group.aliases));
    const rows: ArchivedPricePoint[] = group.rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate));
    return { key: aliases[0], itemName, aliases, rows };
  }).sort((a, b) => a.itemName.localeCompare(b.itemName, "ar"));
}

export function findArchivedItemGroup(itemName: string, groups: ArchivedItemGroup[]): ArchivedItemGroup | undefined {
  const normalized = normalizeSupplierItemName(itemName);
  if (!normalized) return undefined;
  const exact = groups.find(group => group.aliases.includes(normalized));
  if (exact) return exact;
  let best: { group: ArchivedItemGroup; score: number } | undefined;
  for (const group of groups) {
    const score = Math.max(...group.aliases.map(alias => supplierItemNameSimilarity(normalized, alias)));
    if (score >= 0.82 && (!best || score > best.score)) best = { group, score };
  }
  return best?.group;
}

export function latestPricePerSupplier(group: ArchivedItemGroup): ArchivedPricePoint[] {
  const sorted = [...group.rows].filter(row => row.unitCost > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate));
  const latest = new Map<string, ArchivedPricePoint>();
  sorted.forEach(row => { if (!latest.has(row.supplierKey)) latest.set(row.supplierKey, row); });
  return Array.from(latest.values());
}

export function getPriceIncreaseAlert(group: ArchivedItemGroup): PriceIncreaseAlert | undefined {
  const sorted = [...group.rows].filter(row => row.unitCost > 0)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate));
  const seenInvoices = new Set<string>();
  const distinct = sorted.filter(row => {
    if (seenInvoices.has(row.invoiceId)) return false;
    seenInvoices.add(row.invoiceId);
    return true;
  });
  if (distinct.length < 2) return undefined;
  const latest = distinct[0];
  const previous = distinct[1];
  const increase = latest.unitCost - previous.unitCost;
  if (increase <= 0) return undefined;
  return { itemName: group.itemName, latest, previous, increase, percent: previous.unitCost > 0 ? increase / previous.unitCost * 100 : null };
}

export function getSavingsOpportunities(groups: ArchivedItemGroup[]): SavingsOpportunity[] {
  return groups.flatMap(group => {
    const suppliers = latestPricePerSupplier(group);
    const current = [...suppliers].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.invoiceDate.localeCompare(a.invoiceDate))[0];
    if (!current) return [];
    const alternative = suppliers.filter(row => row.supplierKey !== current.supplierKey && row.unitCost < current.unitCost)
      .sort((a, b) => a.unitCost - b.unitCost || b.createdAt.localeCompare(a.createdAt))[0];
    return alternative ? [{ itemName: group.itemName, current, alternative, savingPerUnit: current.unitCost - alternative.unitCost }] : [];
  }).sort((a, b) => b.savingPerUnit - a.savingPerUnit || a.itemName.localeCompare(b.itemName, "ar"));
}
