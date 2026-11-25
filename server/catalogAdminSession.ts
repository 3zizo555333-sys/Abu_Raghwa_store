import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export type CatalogAdminScope = "catalog" | "offers";
export type LocalCatalogAdminClaims = JWTPayload & {
  purpose: "catalog-admin";
  authType: "local-pin";
  scope: CatalogAdminScope;
  shopId: string;
  role: string;
  featureKey: string;
  email?: string;
};

const SIGNING_CONTEXT = "abu-raghwa/catalog-admin/local-pin-session/v2";

export function deriveCatalogAdminSessionKey(secretSource: string): Uint8Array {
  const source = secretSource.trim();
  if (source.length < 32) throw new Error("Catalog admin session signing source must contain at least 32 characters");
  return createHmac("sha256", source).update(SIGNING_CONTEXT).digest();
}

export function getCatalogAdminSessionKey(): Uint8Array {
  const source = process.env.JWT_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!source) throw new Error("Configure JWT_SECRET or SUPABASE_SERVICE_ROLE_KEY before issuing catalog admin sessions");
  return deriveCatalogAdminSessionKey(source);
}

export async function signCatalogAdminToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(getCatalogAdminSessionKey());
}

export async function verifyCatalogAdminToken(token: string): Promise<JWTPayload> {
  const result = await jwtVerify(token, getCatalogAdminSessionKey(), { algorithms: ["HS256"] });
  return result.payload;
}
