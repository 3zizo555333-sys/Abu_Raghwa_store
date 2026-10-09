export type CatalogFulfillmentMode = "pickup" | "delivery";

export type CatalogPricingConfig = {
  deliveryMarkupPercent?: number;
};

export function normalizeDeliveryMarkupPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(500, Math.max(0, Number(parsed.toFixed(2))));
}

export function getCatalogFulfillmentMode(search: string): CatalogFulfillmentMode {
  return new URLSearchParams(search).get("mode") === "delivery" ? "delivery" : "pickup";
}

export function getFulfillmentPrice(basePrice: number, mode: CatalogFulfillmentMode, config: CatalogPricingConfig) {
  const price = Math.max(0, Number(basePrice) || 0);
  if (mode === "pickup") return price;
  return Number((price * (1 + normalizeDeliveryMarkupPercent(config.deliveryMarkupPercent) / 100)).toFixed(2));
}

export function buildCatalogFulfillmentUrl(origin: string, mode: CatalogFulfillmentMode) {
  return `${origin.replace(/\/$/, "")}/catalog?mode=${mode}`;
}
