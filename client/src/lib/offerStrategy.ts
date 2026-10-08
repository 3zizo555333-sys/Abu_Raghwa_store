export type OfferCandidate = {
  id: string;
  name: string;
  costPrice: number;
  retailPrice: number;
  type: "product" | "recipe";
};

export type OfferLine = Pick<OfferCandidate, "name" | "costPrice" | "retailPrice" | "type"> & {
  offerPrice: number;
};

export type StrategyKind = "gift" | "bundle" | "quantity" | "fixedDiscount" | "percentDiscount";

export type OfferDraft = {
  title: string;
  description: string;
  items: OfferLine[];
  originalTotalRetail: number;
  totalCostPrice: number;
  offerPrice: number;
};

const normalized = (value: string) => value.toLowerCase().replace(/ـ/g, "");

export const getStrategyKind = (name: string, description = ""): StrategyKind => {
  const text = normalized(`${name} ${description}`);
  const isGift = /هدية|مجاني|الثانية|الثالثة|اشتري.*وخد|اشتر.*وخد|اشتر.*واحصل/.test(text);
  if (isGift) return "gift";
  if (/باكدج|حزمة|مجموعة|شاملة|متكامل/.test(text)) return "bundle";
  if (/قطعتين|ثلاث.*قطع|كمية|عائلي|مضاعف/.test(text)) return "quantity";
  if (/تخفيض ثابت|\d+\s*جنيه/.test(text)) return "fixedDiscount";
  return "percentDiscount";
};

const getPercent = (name: string, description: string) => {
  const match = `${name} ${description}`.match(/(\d+(?:\.\d+)?)\s*%/);
  const value = Number(match?.[1]);
  if (Number.isFinite(value) && value > 0) return Math.min(value / 100, 0.5);
  return 0.1;
};

const getFixedDiscount = (name: string, description: string) => {
  const match = `${name} ${description}`.match(/(\d+(?:\.\d+)?)\s*جنيه/);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 ? value : 5;
};

const pick = <T>(items: T[], random: () => number) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];

const safeDiscountedPrice = (retailPrice: number, costPrice: number, desiredPrice: number) => {
  if (retailPrice <= costPrice + 1) return null;
  return Math.max(costPrice + 1, Math.min(retailPrice - 1, Math.round(desiredPrice)));
};

const isSameItemGift = (name: string, description: string) => {
  const text = normalized(`${name} ${description}`);
  return /نفس|كيس.*كيس|كيلو.*كيلو|قطعة.*قطعة|واحد.*واحد|1\s*\+\s*1/.test(text);
};

const createGiftOffer = (items: OfferCandidate[], name: string, description: string, random: () => number): OfferDraft | null => {
  const sameItem = isSameItemGift(name, description);
  const strategyText = normalized(`${name} ${description}`);
  const purchaseQuantity = /الثالثة|ثالث|3\s*قطع/.test(strategyText) ? 2 : 1;
  const pairs = items.flatMap(buyItem => items
    .filter(giftItem => !sameItem || giftItem.id === buyItem.id)
    .filter(giftItem => buyItem.retailPrice * purchaseQuantity >= buyItem.costPrice * purchaseQuantity + giftItem.costPrice + 1)
    .map(giftItem => ({ buyItem, giftItem })));

  if (pairs.length === 0) return null;
  const { buyItem, giftItem } = pick(pairs, random);
  const totalCostPrice = buyItem.costPrice * purchaseQuantity + giftItem.costPrice;
  const originalTotalRetail = buyItem.retailPrice * purchaseQuantity + giftItem.retailPrice;
  const offerPrice = Math.max(totalCostPrice + 1, buyItem.retailPrice * purchaseQuantity);
  const sameLabel = buyItem.id === giftItem.id ? `مثلها من ${buyItem.name}` : giftItem.name;
  const buyLabel = purchaseQuantity > 1 ? `${purchaseQuantity} × ${buyItem.name}` : buyItem.name;

  return {
    title: `اشترِ ${buyLabel} وخذ ${sameLabel} هدية`,
    description: `طبقاً للاستراتيجية المختارة: اشترِ ${buyLabel} واحصل على ${sameLabel} هدية، من دون أي خسارة للمحل.`,
    items: [
      { ...buyItem, name: buyLabel, costPrice: buyItem.costPrice * purchaseQuantity, retailPrice: buyItem.retailPrice * purchaseQuantity, offerPrice: buyItem.retailPrice * purchaseQuantity },
      { ...giftItem, name: `هدية: ${sameLabel}`, offerPrice: 0 },
    ],
    originalTotalRetail,
    totalCostPrice,
    offerPrice,
  };
};

const createBundleOffer = (items: OfferCandidate[], random: () => number): OfferDraft | null => {
  if (items.length < 2) return null;
  const chosen: OfferCandidate[] = [];
  const pool = [...items];
  while (pool.length > 0 && chosen.length < Math.min(3, items.length)) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    chosen.push(pool.splice(index, 1)[0]);
  }
  const originalTotalRetail = chosen.reduce((sum, item) => sum + item.retailPrice, 0);
  const totalCostPrice = chosen.reduce((sum, item) => sum + item.costPrice, 0);
  const offerPrice = safeDiscountedPrice(originalTotalRetail, totalCostPrice, originalTotalRetail * 0.88);
  if (offerPrice === null) return null;
  return {
    title: "باكدج أبو رغوة المختار",
    description: `باكدج مطابق للاستراتيجية: ${chosen.map(item => item.name).join(" + ")} بسعر ترويجي آمن.`,
    items: chosen.map(item => ({ ...item, offerPrice: Math.round((item.retailPrice / originalTotalRetail) * offerPrice) })),
    originalTotalRetail,
    totalCostPrice,
    offerPrice,
  };
};

const createQuantityOffer = (items: OfferCandidate[], random: () => number): OfferDraft | null => {
  const item = pick(items, random);
  const originalTotalRetail = item.retailPrice * 2;
  const totalCostPrice = item.costPrice * 2;
  const offerPrice = safeDiscountedPrice(originalTotalRetail, totalCostPrice, originalTotalRetail * 0.9);
  if (offerPrice === null) return null;
  return {
    title: `عرض قطعتين من ${item.name}`,
    description: `طبقاً للاستراتيجية المختارة: اشترِ قطعتين من ${item.name} بسعر أقل من سعرهما القطاعي.`,
    items: [{ ...item, name: `2 × ${item.name}`, costPrice: totalCostPrice, retailPrice: originalTotalRetail, offerPrice }],
    originalTotalRetail,
    totalCostPrice,
    offerPrice,
  };
};

const createSingleDiscountOffer = (items: OfferCandidate[], name: string, description: string, kind: StrategyKind, random: () => number): OfferDraft | null => {
  const item = pick(items, random);
  const desiredPrice = kind === "fixedDiscount"
    ? item.retailPrice - getFixedDiscount(name, description)
    : item.retailPrice * (1 - getPercent(name, description));
  const offerPrice = safeDiscountedPrice(item.retailPrice, item.costPrice, desiredPrice);
  if (offerPrice === null) return null;
  return {
    title: `عرض ${item.name}`,
    description: `عرض مطابق للاستراتيجية المختارة: ${description || name}.`,
    items: [{ ...item, offerPrice }],
    originalTotalRetail: item.retailPrice,
    totalCostPrice: item.costPrice,
    offerPrice,
  };
};

/** يولّد عرضاً من قالب الاستراتيجية نفسه؛ لا يحوّل عرض الهدية إلى خصم أو العكس. */
export const createOfferForStrategy = (
  items: OfferCandidate[],
  strategy: { name: string; description?: string },
  random: () => number = Math.random,
): OfferDraft | null => {
  const validItems = items.filter(item => item.costPrice >= 0 && item.retailPrice > item.costPrice);
  if (validItems.length === 0) return null;

  const description = strategy.description || strategy.name;
  const kind = getStrategyKind(strategy.name, description);
  if (kind === "gift") return createGiftOffer(validItems, strategy.name, description, random);
  if (kind === "bundle") return createBundleOffer(validItems, random);
  if (kind === "quantity") return createQuantityOffer(validItems, random);
  return createSingleDiscountOffer(validItems, strategy.name, description, kind, random);
};
