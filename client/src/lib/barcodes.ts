export type BarcodeProduct = {
  id?: string;
  code?: string;
  barcode?: string;
  barcodes?: string | string[];
  sharedCode?: string;
  sku?: string;
};

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export const normalizeBarcodeToken = (value: string) => value
  .normalize("NFKC")
  .replace(/[٠-٩۰-۹]/g, digit => ARABIC_DIGITS[digit] || digit)
  .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, "")
  .trim()
  // Many handheld scanners prepend AIM symbology identifiers (e.g. ]C1).
  .replace(/^\][a-z]\d/i, "")
  .toLocaleLowerCase("en-US");

/** Accept arrays, comma/space-separated strings, and legacy JSON arrays. */
export const normalizeBarcodeValues = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(normalizeBarcodeValues);
  if (typeof value === "number" && Number.isFinite(value)) return [normalizeBarcodeToken(String(value))].filter(Boolean);
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.flatMap(normalizeBarcodeValues);
    } catch {
      // Fall through to delimiter parsing for malformed legacy values.
    }
  }
  return trimmed.split(/[\s,;|]+/).map(item => normalizeBarcodeToken(item)).filter(Boolean);
};

export const getProductBarcodes = (product: BarcodeProduct): string[] => Array.from(new Set([
  ...normalizeBarcodeValues(product.code),
  ...normalizeBarcodeValues(product.barcodes),
  ...normalizeBarcodeValues(product.sharedCode),
  ...normalizeBarcodeValues(product.sku),
  ...normalizeBarcodeValues(product.barcode),
  ...normalizeBarcodeValues(product.id),
  // Older product records used separate fields such as barcode2/barcode3,
  // while some imports used additionalBarcodes or alternateBarcodes.
  ...Object.entries(product)
    .filter(([key]) => /barcode|bar_code|باركود/i.test(key))
    .flatMap(([, value]) => normalizeBarcodeValues(value)),
])).filter(Boolean);

export const matchesProductBarcode = (product: BarcodeProduct, rawCode: string) => {
  const normalized = normalizeBarcodeToken(rawCode);
  if (!normalized) return false;
  const matchKeys = (value: string) => {
    const compact = normalizeBarcodeToken(value).replace(/[\s-]+/g, "");
    const keys = new Set([compact]);
    // UPC-A may be scanned/stored as the equivalent EAN-13 with a leading 0.
    if (/^0\d{12}$/.test(compact)) keys.add(compact.slice(1));
    else if (/^\d{12}$/.test(compact)) keys.add(`0${compact}`);
    return keys;
  };
  const scannedKeys = matchKeys(normalized);
  return getProductBarcodes(product).some(value => Array.from(matchKeys(value)).some(key => scannedKeys.has(key)));
};

/** Resolve a scan to every matching product so the cashier can disambiguate shared codes safely. */
export const findProductsByBarcode = <T,>(products: readonly T[], rawCode: string): T[] =>
  products.filter(product => matchesProductBarcode(product as BarcodeProduct, rawCode));
