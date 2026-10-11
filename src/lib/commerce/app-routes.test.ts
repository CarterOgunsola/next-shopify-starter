import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { isAppRoute } from "./app-routes";

const APP = join(import.meta.dirname, "../../app");

// Every page and route handler in src/app, as a sample URL.
function appPaths(dir = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return appPaths(full);
    if (!/^(page\.tsx|route\.ts)$/.test(entry.name)) return [];
    const segments = relative(APP, dir)
      .split(sep)
      .filter((s) => s && !/^\(.*\)$/.test(s))
      .map((s) => (s.startsWith("[") ? "sample-1" : s));
    return [`/${segments.join("/")}`];
  });
}

describe("isAppRoute", () => {
  it("knows every route in src/app", () => {
    const paths = appPaths();
    expect(paths.length).toBeGreaterThan(20);
    for (const path of paths) expect(isAppRoute(path), path).toBe(true);
  });

  it.each([
    "/pages/old-faq",
    "/collections/test-apparel/products/test-tee-3-option",
    "/products/a/b",
    "/blogs/news/old-post",
  ])("doesn't claim %s", (path) => {
    expect(isAppRoute(path)).toBe(false);
  });
});
