import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { BRAND, DEFAULT_STORE_NAME, brandFrom } from "./brand";

// The store's names live in brand.ts (set through the environment) only:
// everything else, tests included, reads them from BRAND.

const root = join(import.meta.dirname, "../..");

function gitGrep(pattern: string, paths: string[]) {
  const result = spawnSync(
    "git",
    ["grep", "--untracked", "-l", "-I", "-i", "-E", pattern, "--", ...paths],
    { cwd: root, encoding: "utf8" },
  );
  if (result.error) {
    throw new Error(`This check needs git: ${result.error.message}`);
  }
  return result;
}

// The configured names: from the environment, or from .env.local (which
// the tests don't load) when it sets them.
function configuredNames(): string[] {
  const local = join(root, ".env.local");
  const fromFile = existsSync(local)
    ? parseEnv(readFileSync(local, "utf8"))
    : {};
  const pick = (key: string) => process.env[key] || fromFile[key];
  const brand = brandFrom({
    NEXT_PUBLIC_STORE_NAME: pick("NEXT_PUBLIC_STORE_NAME"),
    NEXT_PUBLIC_SITE_NAME: pick("NEXT_PUBLIC_SITE_NAME"),
    NEXT_PUBLIC_SOURCE_PREFIX: pick("NEXT_PUBLIC_SOURCE_PREFIX"),
  });
  return [...new Set([brand.name, brand.siteName, brand.sourcePrefix])].filter(
    (name) => name !== DEFAULT_STORE_NAME && name.length >= 3,
  );
}

// A name in any case, with or without its spaces, or with hyphens for them
// (as in a domain or a handle).
const namePattern = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[ -]?");

describe("store names", () => {
  it("come from the environment, with neutral defaults", () => {
    expect(brandFrom({})).toEqual({
      name: "Store",
      siteName: "Store",
      sourcePrefix: "Store",
    });
    expect(
      brandFrom({
        NEXT_PUBLIC_STORE_NAME: " Example Goods ",
        NEXT_PUBLIC_SITE_NAME: "Example Journal",
      }),
    ).toEqual({
      name: "Example Goods",
      siteName: "Example Journal",
      sourcePrefix: "Example Goods",
    });
  });

  it("aren't hard-coded: no string or JSX text is just the default name", () => {
    const quoted = `(["'\`>])[[:space:]]*${DEFAULT_STORE_NAME}[[:space:]]*(["'\`<])`;
    const result = gitGrep(quoted, [
      "src",
      "e2e",
      ":!src/lib/brand.ts",
      ":!src/lib/brand.test.ts",
    ]);
    // git grep exits 1 when nothing matches.
    expect(result.stdout).toBe("");
    expect(result.status, result.stderr).toBe(1);
  });

  const names = configuredNames();
  it.runIf(names.length > 0)(
    "appear nowhere else once configured (NEXT_PUBLIC_STORE_NAME and the rest)",
    () => {
      const result = gitGrep(names.map(namePattern).join("|"), [
        ".",
        ":!src/lib/brand.ts",
        ":!.env*",
        ":!pnpm-lock.yaml",
      ]);
      expect(result.stdout).toBe("");
      expect(result.status, result.stderr).toBe(1);
    },
  );

  it("are what the site uses", () => {
    expect(BRAND.name.length).toBeGreaterThan(0);
  });
});
