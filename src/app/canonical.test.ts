import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));

// Each indexable page names its own canonical URL: a path, resolved against
// metadataBase. Never in a layout, which would point every page below it at
// the layout's path, and never on a not-found or error page. Product,
// collection and policy pages set theirs from the handle they render.

const home = await import("./page");
const privacy = await import("./privacy/page");
const terms = await import("./terms/page");
const cookies = await import("./cookies/page");
const privacyChoices = await import("./privacy-choices/page");
const shop = await import("./(shop)/shop/page");

function files(dir: string, name: RegExp): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return files(path, name);
    return name.test(entry) ? [path] : [];
  });
}

describe("canonical URLs", () => {
  it("are never set in a layout, a not-found page or an error page", () => {
    const app = import.meta.dirname;
    const found = files(app, /^(layout|not-found|error|global-error)\.tsx?$/);
    expect(found.length).toBeGreaterThan(3);
    for (const file of found) {
      expect(readFileSync(file, "utf8"), relative(app, file)).not.toMatch(
        /canonical/,
      );
    }
  });

  it("name each of the site's own pages by its own path, without a query", () => {
    for (const [path, page] of [
      ["/", home],
      ["/privacy", privacy],
      ["/terms", terms],
      ["/cookies", cookies],
      ["/privacy-choices", privacyChoices],
      ["/shop", shop],
    ] as const) {
      expect(page.metadata.alternates?.canonical, path).toBe(path);
    }
  });
});
