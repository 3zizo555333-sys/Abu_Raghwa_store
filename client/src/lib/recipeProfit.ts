export interface RecipeProfitInput {
  totalCost: number;
  productionQuantity: number;
  salePrice: number;
}

export function calculateRecipeProfit(input: RecipeProfitInput) {
  const totalCost = Math.max(0, Number(input.totalCost) || 0);
  const productionQuantity = Math.max(1, Number(input.productionQuantity) || 1);
  const salePrice = Math.max(0, Number(input.salePrice) || 0);
  const costPerUnit = totalCost / productionQuantity;
  const totalSaleValue = salePrice * productionQuantity;
  const profitValue = totalSaleValue - totalCost;
  const profitPerUnit = salePrice - costPerUnit;
  const profitPercent = totalSaleValue > 0 ? (profitValue / totalSaleValue) * 100 : 0;

  return {
    costPerUnit,
    totalSaleValue,
    profitValue,
    profitPerUnit: Number(profitPerUnit.toFixed(2)),
    profitPercent: Number(profitPercent.toFixed(2)),
  };
}

export function calculateRecipesProfitSummary(recipes: RecipeProfitInput[]) {
  const totals = recipes.reduce(
    (summary, recipe) => {
      const metrics = calculateRecipeProfit(recipe);
      summary.totalCost += Math.max(0, Number(recipe.totalCost) || 0);
      summary.totalSaleValue += metrics.totalSaleValue;
      return summary;
    },
    { totalCost: 0, totalSaleValue: 0 },
  );

  const totalProfit = totals.totalSaleValue - totals.totalCost;
  const profitPercent = totals.totalSaleValue > 0 ? (totalProfit / totals.totalSaleValue) * 100 : 0;
  return {
    ...totals,
    totalProfit,
    profitPercent: Number(profitPercent.toFixed(2)),
  };
}
