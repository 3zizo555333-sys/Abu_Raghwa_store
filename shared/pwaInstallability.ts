const PUBLIC_CUSTOMER_PATHS = ["/catalog", "/loyalty"] as const;
const PUBLIC_CUSTOMER_PREFIXES = ["/public-offer", "/catalog-offers"] as const;

export function isPublicCustomerPath(pathname: string): boolean {
  const normalizedPath = pathname.split(/[?#]/, 1)[0]?.replace(/\/+$/, "") || "/";
  return (
    PUBLIC_CUSTOMER_PATHS.includes(normalizedPath as (typeof PUBLIC_CUSTOMER_PATHS)[number]) ||
    PUBLIC_CUSTOMER_PREFIXES.some(path => normalizedPath === path || normalizedPath.startsWith(`${path}/`))
  );
}

const INSTALL_META_NAMES = new Set([
  "mobile-web-app-capable",
  "apple-mobile-web-app-capable",
  "apple-mobile-web-app-status-bar-style",
  "apple-mobile-web-app-title",
]);

const STAFF_INSTALL_MARKUP = [
  '<meta name="mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-capable" content="yes" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default" />',
  '<meta name="apple-mobile-web-app-title" content="أبو رغوة" />',
  '<link rel="manifest" href="/manifest.json" />',
].join("\n    ");

export function renderPwaInstallabilityForPath(html: string, pathname: string): string {
  const withoutInstallMetadata = html
    .replace(/<link\b[^>]*>/gi, tag => {
      const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
      return rel?.toLowerCase().split(/\s+/).includes("manifest") ? "" : tag;
    })
    .replace(/<meta\b[^>]*>/gi, tag => {
      const name = tag.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
      return name && INSTALL_META_NAMES.has(name.toLowerCase()) ? "" : tag;
    });

  if (isPublicCustomerPath(pathname)) return withoutInstallMetadata;
  return withoutInstallMetadata.replace("</head>", `    ${STAFF_INSTALL_MARKUP}\n  </head>`);
}
