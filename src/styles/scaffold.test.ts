import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// The scaffold stylesheet must stay removable in one step: delete the file
// and its import line in the root layout. These guards fail if anything
// else comes to depend on it, and still pass once it's removed (then no
// reference may remain).

const SRC = join(import.meta.dirname, "..");
const SCAFFOLD = "styles/scaffold.css";
const LAYOUT = "app/layout.tsx";
const present = existsSync(join(SRC, SCAFFOLD));

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

describe("scaffold styles", () => {
  it("are referenced only by their one import in the root layout", () => {
    for (const file of files(SRC)) {
      const path = relative(SRC, file);
      if (path === SCAFFOLD || path === "styles/scaffold.test.ts") continue;
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => /scaffold/i.test(line));
      if (path === LAYOUT) {
        expect(
          lines.filter((line) => line.startsWith("import")),
          path,
        ).toEqual(present ? ['import "@/styles/scaffold.css";'] : []);
        continue;
      }
      expect(lines, path).toEqual([]);
    }
  });

  it.skipIf(!present)(
    "load before globals.css, so their layer order is declared first",
    () => {
      const layout = readFileSync(join(SRC, LAYOUT), "utf8");
      expect(layout.indexOf('import "@/styles/scaffold.css";')).toBeLessThan(
        layout.indexOf('import "./globals.css";'),
      );
    },
  );

  it.skipIf(!present)(
    "use no classes and stay at zero specificity inside their layer",
    () => {
      const css = readFileSync(join(SRC, SCAFFOLD), "utf8");
      expect(css).toMatch(
        /^@layer theme, base, scaffold, components, utilities;$/m,
      );
      const body = css
        .slice(css.indexOf("@layer scaffold {") + "@layer scaffold {".length)
        .replace(/\/\*[\s\S]*?\*\//g, "");
      // Every selector: the text before each "{".
      const rules = [...body.matchAll(/([^{}]+)\{/g)]
        .map((m) => m[1].trim())
        .filter((rule) => !rule.startsWith("@media"));
      expect(rules.length).toBeGreaterThan(20);
      for (const rule of rules) {
        // The whole selector is one :where(...), optionally followed by a
        // pseudo-element (which can't go inside :where(): a rule with one
        // there is invalid and dropped).
        const inner = wrappedSelector(rule);
        expect(inner, rule).not.toBeNull();
        expect(inner, rule).not.toMatch(/::/);
        expect(rule.replace(/\[[^\]]*\]/g, ""), rule).not.toMatch(/\.[a-z]/i);
      }
    },
  );

  it("keep their custom properties (--sc-*) to themselves", () => {
    for (const file of files(SRC)) {
      const path = relative(SRC, file);
      if (path === SCAFFOLD || path === "styles/scaffold.test.ts") continue;
      expect(readFileSync(file, "utf8"), path).not.toMatch(/--sc-/);
    }
  });
});

// The selector inside a leading :where( ... ) that spans the whole rule
// (bar a trailing pseudo-element), or null.
function wrappedSelector(rule: string): string | null {
  if (!rule.startsWith(":where(")) return null;
  let depth = 0;
  for (let i = ":where".length; i < rule.length; i++) {
    if (rule[i] === "(") depth++;
    else if (rule[i] === ")" && --depth === 0) {
      const rest = rule.slice(i + 1);
      return rest === "" || /^::[a-z-]+$/.test(rest)
        ? rule.slice(":where(".length, i)
        : null;
    }
  }
  return null;
}
