import { getProductBarcodes, normalizeBarcodeToken, normalizeBarcodeValues, type BarcodeProduct } from "./barcodes";

export const INITIAL_TOTAL_PRODUCT_BARCODE_SLOTS = 5;
export const INITIAL_ADDITIONAL_BARCODE_SLOTS = INITIAL_TOTAL_PRODUCT_BARCODE_SLOTS - 1;

export const createEmptyAdditionalBarcodeSlots = () =>
  Array.from({ length: INITIAL_ADDITIONAL_BARCODE_SLOTS }, () => "");

/** Convert both current arrays and legacy comma/space-delimited fields into separate edit inputs. */
export const getAdditionalBarcodeSlots = (product: BarcodeProduct): string[] => {
  const primary = normalizeBarcodeToken(String(product.code ?? ""));
  const productId = normalizeBarcodeToken(String(product.id ?? ""));
  const aliases = Array.from(new Set([
    ...normalizeBarcodeValues(product.barcodes),
    ...getProductBarcodes(product),
  ])).filter(value => {
    const normalized = normalizeBarcodeToken(value);
    return normalized && normalized !== primary && normalized !== productId;
  });
  return aliases.length >= INITIAL_ADDITIONAL_BARCODE_SLOTS
    ? aliases
    : [...aliases, ...Array.from({ length: INITIAL_ADDITIONAL_BARCODE_SLOTS - aliases.length }, () => "")];
};

/** A comma, semicolon, pipe, or internal whitespace means more than one code was entered in a single slot. */
export const containsMultipleBarcodeValues = (value: string) => /[,;|\s]/.test(value.trim());

export const collectProductBarcodes = (primary: string, additional: readonly string[]) =>
  Array.from(new Set([primary, ...additional]
    .map(value => normalizeBarcodeToken(value))
    .filter(Boolean)));

export const getBarcodeFieldError = (primary: string, additional: readonly string[]) => {
  if (containsMultipleBarcodeValues(primary)) return { field: "primary" as const };
  const index = additional.findIndex(containsMultipleBarcodeValues);
  return index < 0 ? null : { field: "additional" as const, index };
};
