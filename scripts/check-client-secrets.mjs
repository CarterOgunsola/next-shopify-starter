// Fails the build if a server-only secret reaches anything the browser can
// download: client JS/CSS in .next/static and prerendered HTML/RSC payloads
// in .next/server/app. Runs after `next build`.
//
// Two checks:
// - the value of each secret env var, when it's set
// - marker strings that only server code contains (auth header names), so
//   the check works without real keys
//
// Never prints a secret value, only the variable name and the file.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SECRET_VARS = [
  "KLAVIYO_PRIVATE_API_KEY",
  "SHOPIFY_PRIVATE_ACCESS_TOKEN",
  "SHOPIFY_WEBHOOK_SECRET",
  "MENUS_REVALIDATE_SECRET",
  "CUSTOMER_ACCOUNT_SESSION_SECRET",
  "SHOPIFY_STOREFRONT_PASSWORD",
  "JUDGEME_PRIVATE_TOKEN",
];
const SERVER_MARKERS = ["Klaviyo-API-Key", "Shopify-Storefront-Private-Token"];

// Same files, in the same order, as Next reads for `next build`. Real env
// vars win, then the first file that sets a variable.
for (const file of [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

function* files(dir, extensions) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* files(path, extensions);
    else if (extensions.some((ext) => entry.name.endsWith(ext))) yield path;
  }
}

const clientFiles = [...files(".next/static", [".js", ".css", ".json"])];
const prerendered = [
  ...files(".next/server/app", [".html", ".rsc", ".body", ".meta"]),
];

if (clientFiles.length === 0) {
  console.error("check-client-secrets: no .next/static output. Build first.");
  process.exit(1);
}

const problems = [];

for (const name of SECRET_VARS) {
  const value = process.env[name];
  if (!value || value.length < 8) continue;
  for (const file of [...clientFiles, ...prerendered]) {
    if (readFileSync(file, "utf8").includes(value)) {
      problems.push(`${name} value found in ${file}`);
    }
  }
}

for (const marker of SERVER_MARKERS) {
  for (const file of [...clientFiles, ...prerendered]) {
    if (readFileSync(file, "utf8").includes(marker)) {
      problems.push(`server-only marker "${marker}" found in ${file}`);
    }
  }
}

if (problems.length) {
  console.error("Server secrets in client output or prerendered pages:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const checked = SECRET_VARS.filter((name) => process.env[name]).length;
console.log(
  `check-client-secrets: ok (${clientFiles.length + prerendered.length} files, ${checked}/${SECRET_VARS.length} secret values set, ${SERVER_MARKERS.length} markers)`,
);
