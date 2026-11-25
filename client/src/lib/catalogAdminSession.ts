export type CatalogAdminScope = "catalog" | "offers";

const SESSION_STORAGE_KEY = "abu_catalog_admin_session_v2";

export function readCatalogAdminSessionToken(): string | null {
  try {
    const token = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    return token?.trim() || null;
  } catch {
    return null;
  }
}

export function saveCatalogAdminSessionToken(token: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // The server still enforces the signed token; storage unavailability is surfaced by the next request.
  }
}

export function clearCatalogAdminSessionToken(): void {
  try { window.sessionStorage.removeItem(SESSION_STORAGE_KEY); } catch { /* storage may be unavailable */ }
}

export function catalogAdminScopeForFeature(featureKey: string): CatalogAdminScope | null {
  if (featureKey === "screen__catalog_management" || featureKey === "screen__catalog_manager") return "catalog";
  if (featureKey === "screen__smart_offers") return "offers";
  return null;
}
