import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The dev store's real gift cards must never appear in the repo, not even
// their endings (tests and fixtures use made-up ones, like 0000). Their
// codes aren't in the repo either: run with DEV_GIFT_CARD_CODES (comma
// separated) to check, e.g. before the first push.
const codes = (process.env.DEV_GIFT_CARD_CODES ?? "")
  .split(",")
  .map((code) => code.replace(/\s+/g, "").toLowerCase())
  .filter(Boolean);

const root = join(import.meta.dirname, "../../../..");

function files(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(root, path)).isDirectory()) return files(path);
    return /\.(ts|tsx|mjs|json|md)$/.test(name) ? [path] : [];
  });
}

describe.runIf(codes.length > 0)("dev store gift cards", () => {
  it("appear nowhere in the code, tests or fixtures", () => {
    const endings = codes.map((code) => code.slice(-4));
    const found = [...files("src"), ...files("e2e")].flatMap((path) => {
      const text = readFileSync(join(root, path), "utf8").toLowerCase();
      return [...codes, ...endings].some((value) => text.includes(value))
        ? [path]
        : [];
    });
    // File names only: the values themselves are never printed.
    expect(found).toEqual([]);
  });
});
