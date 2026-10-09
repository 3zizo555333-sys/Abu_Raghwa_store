export type LoyaltyReportSale = { items: Array<{ productId: string; productName?: string; quantity: number }> };
export type LoyaltyReportItem = { id: string; name: string; loyaltyPoints?: number };
export type LoyaltyRankingRow = { name: string; sold: number; points: number };

export function buildLoyaltyRanking(
  sales: LoyaltyReportSale[],
  products: LoyaltyReportItem[],
  recipes: LoyaltyReportItem[] = [],
): LoyaltyRankingRow[] {
  const configured = new Map<string, { name: string; points: number }>();
  [...products, ...recipes.map(recipe => ({ ...recipe, id: `catalog_recipe_${recipe.id}` }))].forEach(item => {
    configured.set(item.id, {
      name: item.name,
      points: Math.max(0, Math.trunc(Number(item.loyaltyPoints) || 0)),
    });
  });

  const totals = new Map<string, { sold: number; points: number }>();
  sales.forEach(sale => sale.items.forEach(item => {
    const product = configured.get(item.productId);
    if (!product || product.points <= 0) return;
    const quantity = Math.max(0, Math.trunc(Number(item.quantity) || 0));
    if (quantity <= 0) return;
    const current = totals.get(product.name) || { sold: 0, points: 0 };
    current.sold += quantity;
    current.points += product.points * quantity;
    totals.set(product.name, current);
  }));

  return Array.from(totals.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.points - a.points || b.sold - a.sold)
    .slice(0, 10);
}

export function normalizeWhatsAppPhone(value?: string) {
  const raw = String(value || "").replace(/[^0-9+]/g, "");
  return raw.startsWith("01") ? `20${raw.slice(1)}` : raw.replace(/^\+/, "");
}

export function buildLoyaltyWhatsAppUrl(origin: string, code: string, name?: string, phone?: string) {
  const loyaltyUrl = `${origin}/loyalty?code=${encodeURIComponent(code)}`;
  const message = `أهلًا ${name || "بك"}، هذه صفحة نقاطك من أبو رغوة.\n\nكود الولاء: ${code}\nرابط متابعة الرصيد والهدايا: ${loyaltyUrl}`;
  const targetPhone = normalizeWhatsAppPhone(phone);
  const base = targetPhone.length >= 10 ? `https://wa.me/${targetPhone}` : "https://api.whatsapp.com/send";
  return `${base}?text=${encodeURIComponent(message)}`;
}

export function hasOptionalLoyaltyPoints(value: unknown) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}
