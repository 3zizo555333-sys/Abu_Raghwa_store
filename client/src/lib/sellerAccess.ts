const SELLER_ALLOWED_EXACT_PATHS = new Set(["/cashier", "/catalog", "/catalog-offers"]);

/** Normalize query strings and trailing slashes before applying the seller route allowlist. */
export function canSellerAccessPath(pathname: string): boolean {
  const normalized = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  return SELLER_ALLOWED_EXACT_PATHS.has(normalized)
    || normalized === "/public-offer"
    || normalized.startsWith("/public-offer/");
}
