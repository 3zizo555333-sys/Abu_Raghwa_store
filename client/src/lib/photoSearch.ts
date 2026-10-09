export type PhotoSearchProduct = {
  id: string;
  name: string;
  code?: string;
  catalogImageUrl?: string;
  retailPrice?: number;
  wholesaleRetailPrice?: number;
  bulkPrice?: number;
};

export type PhotoCandidatePayload = {
  id: string;
  name: string;
  code: string;
  imageUrl?: string;
};

export function getPhotoCandidatePayload(products: PhotoSearchProduct[], limit = 120): PhotoCandidatePayload[] {
  return products.slice(0, limit).map(product => ({
    id: product.id,
    name: product.name,
    code: product.code || "",
    imageUrl: product.catalogImageUrl || undefined,
  }));
}

export function getPhotoMatchProduct(products: PhotoSearchProduct[], productId: string, confidence: number, minimumConfidence = 0.35): PhotoSearchProduct | null {
  if (!productId || confidence < minimumConfidence) return null;
  return products.find(product => product.id === productId) || null;
}

export function getPhotoFallbackProducts(products: PhotoSearchProduct[], limit = 8): PhotoSearchProduct[] {
  return products.filter(product => Boolean(product.catalogImageUrl)).slice(0, limit);
}

export function getProductPrice(product?: PhotoSearchProduct | null): number {
  return Number(product?.wholesaleRetailPrice) || Number(product?.retailPrice) || Number(product?.bulkPrice) || 0;
}
