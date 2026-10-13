import type { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { createContext, type TrpcContext } from "./context";

function normalizedHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>;
  headers.forEach((value, key) => { result[key.toLowerCase()] = value; });
  return result;
}

function cookieOptions(options: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = {};
  for (const key of ["httpOnly", "secure", "path", "domain", "sameSite", "expires"] as const) {
    if (options[key] !== undefined) result[key] = options[key];
  }
  if (typeof options.maxAge === "number") result.maxAge = Math.floor(options.maxAge / 1000);
  return result;
}

function serializeCookie(name: string, value: string, options: Record<string, unknown> = {}): string {
  const attributes = [`${name}=${encodeURIComponent(value)}`];
  if (typeof options.maxAge === "number") attributes.push(`Max-Age=${Math.floor(options.maxAge as number)}`);
  if (typeof options.domain === "string") attributes.push(`Domain=${options.domain}`);
  if (typeof options.path === "string") attributes.push(`Path=${options.path}`);
  if (options.expires instanceof Date) attributes.push(`Expires=${options.expires.toUTCString()}`);
  if (options.httpOnly === true) attributes.push("HttpOnly");
  if (options.secure === true) attributes.push("Secure");
  if (options.sameSite) {
    const sameSite = String(options.sameSite);
    attributes.push(`SameSite=${sameSite.charAt(0).toUpperCase()}${sameSite.slice(1).toLowerCase()}`);
  }
  return attributes.join("; ");
}

export async function createFetchContext(input: { req: Request; resHeaders: Headers }): Promise<TrpcContext> {
  const request = input.req;
  const headers = normalizedHeaders(request.headers);
  const url = new URL(request.url);
  const forwardedProto = headers["x-forwarded-proto"]?.split(",")[0]?.trim();
  const protocol = forwardedProto || url.protocol.replace(/:$/, "") || "https";
  const req = {
    headers,
    url: `${url.pathname}${url.search}`,
    originalUrl: `${url.pathname}${url.search}`,
    method: request.method,
    protocol,
    secure: protocol === "https",
    get(name: string) { return headers[name.toLowerCase()]; },
  } as unknown as ExpressRequest;
  const res = {
    cookie(name: string, value: string, options?: Record<string, unknown>) {
      input.resHeaders.append("Set-Cookie", serializeCookie(name, value, cookieOptions(options)));
      return this;
    },
    clearCookie(name: string, options?: Record<string, unknown>) {
      input.resHeaders.append("Set-Cookie", serializeCookie(name, "", { ...cookieOptions(options), expires: new Date(0), maxAge: 0 }));
      return this;
    },
  } as unknown as ExpressResponse;
  return createContext({ req, res } as Parameters<typeof createContext>[0]);
}
