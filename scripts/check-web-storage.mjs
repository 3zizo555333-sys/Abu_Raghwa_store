#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(root, "client", "src");
const baselineFile = path.join(root, "scripts", "web-storage-baseline.json");
const strict = process.argv.includes("--strict");
const writeBaseline = process.argv.includes("--write-baseline");
const pattern = /\b(?:window\s*\.\s*)?(?:localStorage|sessionStorage)\b|\bindexedDB\b|\bStorage\s*\.\s*prototype\b/g;
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const found = {};
const allowedLegacyCredentialKeys = new Set([
  "abu_staff_sync_token",
  "abu_staff_cookie_session",
  "abu_raghwa_current_user",
  "abu_raghwa_manager_session",
  "abu_catalog_admin_token",
  "abu_employee_finance_token",
  "abu_raghwa_device_id",
  "manus-cookie",
  "manus-runtime-user-info",
  "abu_raghwa_security_settings",
]);

function isAllowedLegacyCredentialPurge(relativeFile) {
  if (relativeFile !== "client/src/main.tsx") return false;
  const source = fs.readFileSync(path.join(root, relativeFile), "utf8");
  const startMarker = "// Purge obsolete browser-held credentials and plaintext section passwords.";
  const endMarker = "// Apply the current route's installability policy";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) return false;

  const beforeAndAfter = source.slice(0, start) + source.slice(end);
  if (new RegExp(pattern.source).test(beforeAndAfter)) return false;
  const purge = source.slice(start, end);
  if ((purge.match(pattern) ?? []).length !== 2) return false;

  const methods = [...purge.matchAll(/\b(?:window\s*\.\s*)?(localStorage|sessionStorage)\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g)];
  if (methods.length !== 2 || methods.some((match) => match[2] !== "removeItem")) return false;
  if (new Set(methods.map((match) => match[1])).size !== 2) return false;

  const keyArray = purge.match(/for\s*\(\s*const\s+key\s+of\s*\[([\s\S]*?)\]\s*\)/);
  if (!keyArray) return false;
  const keys = [...keyArray[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
  return keys.length > 0 && new Set(keys).size === keys.length && keys.every((key) => allowedLegacyCredentialKeys.has(key));
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (extensions.has(path.extname(file)) && !/\.test\.[^.]+$/.test(file)) {
      const text = fs.readFileSync(file, "utf8");
      const matches = text.match(pattern) ?? [];
      if (matches.length) found[path.relative(root, file).split(path.sep).join("/")] = matches.length;
    }
  }
}

if (!fs.existsSync(sourceRoot)) throw new Error(`Missing source directory: ${sourceRoot}`);
walk(sourceRoot);

if (writeBaseline) {
  fs.writeFileSync(baselineFile, `${JSON.stringify(found, null, 2)}\n`);
  console.log(`Stored current legacy baseline in ${path.relative(root, baselineFile)} (${Object.values(found).reduce((a, b) => a + b, 0)} references across ${Object.keys(found).length} files).`);
  process.exit(0);
}

if (strict) {
  const violations = { ...found };
  if (violations["client/src/main.tsx"] && isAllowedLegacyCredentialPurge("client/src/main.tsx")) {
    delete violations["client/src/main.tsx"];
  }
  if (Object.keys(violations).length) {
    console.error(`Found ${Object.values(violations).reduce((a, b) => a + b, 0)} disallowed browser-storage references in ${Object.keys(violations).length} files.`);
    for (const [file, count] of Object.entries(violations)) console.error(`  ${file}: ${count}`);
    process.exit(1);
  }
  const allowedCount = found["client/src/main.tsx"] ?? 0;
  console.log(`Strict check passed: no disallowed Local/Session Storage or IndexedDB references found${allowedCount ? `; ${allowedCount} references are limited to the approved legacy-credential removeItem purge` : ""}.`);
  process.exit(0);
}

if (!fs.existsSync(baselineFile)) throw new Error("Baseline file is missing; run with --write-baseline once after review.");
const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
const violations = [];
for (const [file, count] of Object.entries(found)) {
  const allowed = Number(baseline[file] ?? 0);
  if (count > allowed) violations.push(`${file}: ${count} references (baseline ${allowed})`);
}
if (violations.length) {
  console.error("New browser-storage references are not allowed:\n" + violations.join("\n"));
  process.exit(1);
}
console.log(`Regression check passed (${Object.values(found).reduce((a, b) => a + b, 0)} existing references remain; --strict is required after migration reaches zero).`);
