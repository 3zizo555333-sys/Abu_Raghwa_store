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
  if (Object.keys(found).length) {
    console.error(`Found ${Object.values(found).reduce((a, b) => a + b, 0)} browser-storage references in ${Object.keys(found).length} files.`);
    for (const [file, count] of Object.entries(found)) console.error(`  ${file}: ${count}`);
    process.exit(1);
  }
  console.log("Strict check passed: no Local/Session Storage or IndexedDB references found.");
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
