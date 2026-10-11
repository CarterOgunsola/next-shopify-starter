import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// What browser code can reach, following static imports from every
// "use client" file (dynamic import() loads on demand and isn't followed;
// "use server" modules are references, not code).
// Some packages are heavy and only needed on the server: they stay out.
const SERVER_ONLY_PACKAGES = ["zod"];

const root = join(import.meta.dirname, "../..");
const src = join(root, "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// Comments removed, strings and template literals left as they are (a
// quote inside a comment, or // inside a string, can't confuse what
// follows).
export function stripComments(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") i++;
    } else if (c === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      i = end === -1 ? code.length : end + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const start = i++;
      while (i < code.length && code[i] !== c) i += code[i] === "\\" ? 2 : 1;
      out += code.slice(start, ++i);
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

function resolve(from: string, spec: string): string | null {
  // TypeScript's ".js" for a ".ts" file.
  spec = spec.replace(/\.js$/, "");
  const base = spec.startsWith("@/")
    ? join(src, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

// Static imports and re-exports, not `import type`.
const IMPORT =
  /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;

describe("client bundles", () => {
  it("don't reach server-only packages", () => {
    const entries = files(src).filter((file) =>
      /^\s*["']use client["']/.test(stripComments(readFileSync(file, "utf8"))),
    );
    const seen = new Set<string>();
    const problems: string[] = [];
    const visit = (file: string, chain: string[]) => {
      if (seen.has(file)) return;
      seen.add(file);
      const text = stripComments(readFileSync(file, "utf8"));
      // Server actions reach the browser as references, never as code.
      if (/^\s*["']use server["']/.test(text)) return;
      for (const [, spec] of text.matchAll(IMPORT)) {
        if (
          SERVER_ONLY_PACKAGES.some(
            (p) => spec === p || spec.startsWith(`${p}/`),
          )
        ) {
          problems.push(
            [...chain, file].map((f) => relative(root, f)).join(" -> ") +
              ` imports ${spec}`,
          );
        }
        const next = resolve(file, spec);
        if (next) visit(next, [...chain, file]);
      }
    };
    for (const entry of entries) visit(entry, []);
    expect(problems).toEqual([]);
  });

  it("reads imports past comments, and directives after them", () => {
    const code = [
      "// A leading comment",
      '"use client";',
      "import {",
      "  a, // it's the first one",
      "  /* b's comment */ b,",
      '} from "./x.js";',
      'const url = "https://example.test"; // not an import',
    ].join("\n");
    const stripped = stripComments(code);
    expect(/^\s*["']use client["']/.test(stripped)).toBe(true);
    expect([...stripped.matchAll(IMPORT)].map((m) => m[1])).toEqual(["./x.js"]);
    expect(stripped).toContain('"https://example.test"');
  });
});
