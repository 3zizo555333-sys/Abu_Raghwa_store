// Design note: keep the profit summary quiet, data-first, and explicit about whether it uses the catalogue or stock quantities.

export interface ProfitProductLike {
  wholesalePricePerUnit?: number;
  wholesalePricePerPiece?: number;
  unitsPerPackage?: number;
  wholesalePrice?: number;
  wholesaleRetailPrice?: number;
  retailPrice?: number;
  unit?: string;
  contentUnit?: string;
  availableQuantity?: number;
  quantity?: number;
}

export interface StoreProfitSummary {
  pricedProducts: number;
  catalogueCost: number;
  catalogueSale: number;
  catalogueProfit: number;
  catalogueProfitPercent: number;
  stockPieces: number;
  stockCost: number;
  stockSale: number;
  stockProfit: number;
  stockProfitPercent: number;
}

export interface RecipeUnitProfitLike {
  totalCost?: number;
  productionQuantity?: number;
  salePrice?: number;
}

export interface TradeMarginSummary {
  pricedProducts: number;
  pricedRecipes: number;
  totalPricedItems: number;
  unitCost: number;
  unitSale: number;
  unitProfit: number;
  marginPercent: number;
}

const toNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** تكلفة القطعة التي يجب مقارنتها بسعر بيع القطعة. */
export const getPieceCost = (product: ProfitProductLike) => {
  const cartonCost = toNumber(product.wholesalePrice) || toNumber(product.wholesalePricePerUnit);
  const unitsPerPackage = toNumber(product.unitsPerPackage);
  const storedPieceCost = toNumber(product.wholesalePricePerPiece);

  if (cartonCost > 0 && unitsPerPackage > 0) {
    return Math.round((cartonCost / unitsPerPackage) * 100) / 100;
  }
  return storedPieceCost > 0 ? storedPieceCost : cartonCost;
};

/** سعر بيع القطعة القطاعي، مع دعم السجلات القديمة التي لم تفصل القطاعي عن التجزئة. */
export const getPieceSalePrice = (product: ProfitProductLike) => {
  const sectorSale = toNumber(product.wholesaleRetailPrice);
  return sectorSale > 0 ? sectorSale : toNumber(product.retailPrice);
};

/** الكمية بوحدة المحتوى؛ إذا كان المخزون عبوات نحوله إلى محتوى العبوة. */
export const getStockPieces = (product: ProfitProductLike) => {
  const quantity = Math.max(0, toNumber(product.availableQuantity ?? product.quantity));
  const unitsPerPackage = toNumber(product.unitsPerPackage);
  return unitsPerPackage > 0 ? quantity * unitsPerPackage : quantity;
};

const percent = (profit: number, cost: number) => cost > 0 ? (profit / cost) * 100 : 0;

/**
 * يحسب نسبة قائمة المنتجات على أساس قطعة واحدة من كل صنف،
 * ونسبة المخزون على أساس الكمية المتوفرة الفعلية.
 */
export const calculateStoreProfitSummary = (products: ProfitProductLike[]): StoreProfitSummary => {
  let pricedProducts = 0;
  let catalogueCost = 0;
  let catalogueSale = 0;
  let stockPieces = 0;
  let stockCost = 0;
  let stockSale = 0;

  products.forEach((product) => {
    const pieceCost = getPieceCost(product);
    const pieceSale = getPieceSalePrice(product);
    if (pieceCost <= 0 || pieceSale <= 0) return;

    pricedProducts += 1;
    catalogueCost += pieceCost;
    catalogueSale += pieceSale;

    const pieces = getStockPieces(product);
    stockPieces += pieces;
    stockCost += pieceCost * pieces;
    stockSale += pieceSale * pieces;
  });

  const catalogueProfit = catalogueSale - catalogueCost;
  const stockProfit = stockSale - stockCost;

  return {
    pricedProducts,
    catalogueCost,
    catalogueSale,
    catalogueProfit,
    catalogueProfitPercent: percent(catalogueProfit, catalogueCost),
    stockPieces,
    stockCost,
    stockSale,
    stockProfit,
    stockProfitPercent: percent(stockProfit, stockCost)
  };
};

/**
 * يقيس هامش ربح المهنة من تسعير وحدة واحدة من كل صنف وتركبية،
 * ولذلك لا يتأثر بعدد الكراتين أو كمية المخزون الحالية.
 */
export const calculateTradeMarginSummary = (
  products: ProfitProductLike[],
  recipes: RecipeUnitProfitLike[],
): TradeMarginSummary => {
  let pricedProducts = 0;
  let pricedRecipes = 0;
  let unitCost = 0;
  let unitSale = 0;

  products.forEach((product) => {
    const cost = getPieceCost(product);
    const sale = getPieceSalePrice(product);
    if (cost <= 0 || sale <= 0) return;
    pricedProducts += 1;
    unitCost += cost;
    unitSale += sale;
  });

  recipes.forEach((recipe) => {
    const totalCost = Math.max(0, toNumber(recipe.totalCost));
    const quantity = Math.max(1, toNumber(recipe.productionQuantity) || 1);
    const cost = totalCost / quantity;
    const sale = Math.max(0, toNumber(recipe.salePrice));
    if (cost <= 0 || sale <= 0) return;
    pricedRecipes += 1;
    unitCost += cost;
    unitSale += sale;
  });

  const unitProfit = unitSale - unitCost;
  return {
    pricedProducts,
    pricedRecipes,
    totalPricedItems: pricedProducts + pricedRecipes,
    unitCost,
    unitSale,
    unitProfit,
    marginPercent: percent(unitProfit, unitCost),
  };
};
