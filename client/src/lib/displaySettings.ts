export type DisplayCardStyle = "soft" | "glass" | "solid";
export type DisplayTheme = "warm" | "dark" | "light";

export type DisplaySettings = {
  enabled: boolean;
  title: string;
  subtitle: string;
  shopName: string;
  shopPhone: string;
  rotationSeconds: number;
  showPrices: boolean;
  showProducts: boolean;
  showOffers: boolean;
  selectedProductIds: string[];
  selectedOfferIds: string[];
  theme: DisplayTheme;
  primaryColor: string;
  accentColor: string;
  cardStyle: DisplayCardStyle;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  enabled: true,
  title: "منتجاتنا وعروضنا",
  subtitle: "اختيارات المحل",
  shopName: "أبو رغوة",
  shopPhone: "",
  rotationSeconds: 30,
  showPrices: true,
  showProducts: true,
  showOffers: true,
  selectedProductIds: [],
  selectedOfferIds: [],
  theme: "warm",
  primaryColor: "#f97316",
  accentColor: "#fbbf24",
  cardStyle: "glass",
};

export function normalizeDisplaySettings(value: unknown): DisplaySettings {
  const source = value && typeof value === "object" ? value as Partial<DisplaySettings> : {};
  const asIds = (items: unknown) => Array.isArray(items) ? items.map(String).filter(Boolean) : [];
  const seconds = Number(source.rotationSeconds);
  return {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...source,
    enabled: source.enabled !== false,
    title: String(source.title || DEFAULT_DISPLAY_SETTINGS.title),
    subtitle: String(source.subtitle || DEFAULT_DISPLAY_SETTINGS.subtitle),
    shopName: String(source.shopName || DEFAULT_DISPLAY_SETTINGS.shopName),
    shopPhone: String(source.shopPhone || ""),
    rotationSeconds: Number.isFinite(seconds) ? Math.min(300, Math.max(5, Math.round(seconds))) : 30,
    showPrices: source.showPrices !== false,
    showProducts: source.showProducts !== false,
    showOffers: source.showOffers !== false,
    selectedProductIds: asIds(source.selectedProductIds),
    selectedOfferIds: asIds(source.selectedOfferIds),
    theme: source.theme === "dark" || source.theme === "light" ? source.theme : "warm",
    primaryColor: /^#[0-9a-f]{6}$/i.test(String(source.primaryColor || "")) ? String(source.primaryColor) : DEFAULT_DISPLAY_SETTINGS.primaryColor,
    accentColor: /^#[0-9a-f]{6}$/i.test(String(source.accentColor || "")) ? String(source.accentColor) : DEFAULT_DISPLAY_SETTINGS.accentColor,
    cardStyle: source.cardStyle === "soft" || source.cardStyle === "solid" ? source.cardStyle : "glass",
  };
}
