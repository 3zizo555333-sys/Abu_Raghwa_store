export type CategorizedProduct = {
  category?: string | null;
};

export type ProductCategoryCount = {
  category: string;
  count: number;
};

export function filterProductsByCategory<T extends CategorizedProduct>(products: T[], category: string): T[] {
  if (category === "all") return products;
  return products.filter(product => product.category === category);
}

export function countProductsByCategory<T extends CategorizedProduct>(products: T[], categories: string[]): ProductCategoryCount[] {
  return categories.map(category => ({
    category,
    count: products.filter(product => product.category === category).length,
  }));
}
