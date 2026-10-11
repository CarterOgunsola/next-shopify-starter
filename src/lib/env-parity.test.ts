import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Every variable the site reads is documented in .env.example, so a deploy
// (and the end-to-end tests, which blank the file's variables) knows them.

const root = join(import.meta.dirname, "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

// Set by the platform or used only by tooling, not the site's settings.
const NOT_SETTINGS = new Set([
  "NODE_ENV",
  "PATH",
  "CI",
  "VERCEL",
  "VERCEL_ENV",
  "E2E",
  "E2E_PORT",
  "E2E_SKIP_BUILD",
  "LAUNCH_CHECK",
  "VITEST_LIVE",
  // Only when recording fixtures.
  "GIFT_CARD_CODE",
  // Set by Next itself in end-to-end test mode.
  "NEXT_PRIVATE_TEST_PROXY",
]);

function sources(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return sources(path);
    return /\.(ts|tsx|mjs)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

describe(".env.example", () => {
  const documented = new Set(
    read(".env.example").match(/^[A-Z][A-Z0-9_]*(?==)/gm) ?? [],
  );

  it("lists every variable the code reads", () => {
    const used = new Set<string>();
    for (const file of [...sources("src"), "next.config.ts"]) {
      for (const [, name] of read(file).matchAll(
        // process.env.X, and env.X on an env object passed around.
        /\benv\.([A-Z][A-Z0-9_]{2,})\b/g,
      )) {
        used.add(name);
      }
    }
    // The env schemas name their variables as object keys.
    for (const file of [
      "src/lib/env.ts",
      "src/lib/commerce/config.server.ts",
    ]) {
      for (const [, name] of read(file).matchAll(
        /^\s+([A-Z][A-Z0-9_]{2,}):/gm,
      )) {
        used.add(name);
      }
    }
    const missing = [...used].filter(
      (name) => !documented.has(name) && !NOT_SETTINGS.has(name),
    );
    expect(missing).toEqual([]);
  });
});
