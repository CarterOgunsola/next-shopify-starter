import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type * as catalog from "./catalog.server";
import type { BuyerContext, PublicContext } from "./types";

// Guards the caching rule: shared ("use cache") reads take a PublicContext
// only, and buyer-specific reads are never cached.

function functionsIn(
  file: string,
  pattern = /^export async function /m,
): Map<string, string> {
  const source = readFileSync(join(import.meta.dirname, file), "utf8");
  const parts = source.split(pattern).slice(1);
  return new Map(parts.map((part) => [part.slice(0, part.indexOf("(")), part]));
}
const exportedFunctions = (file: string) => functionsIn(file);

describe("catalog.server.ts", () => {
  it('caches every function that calls Shopify with "use cache"', () => {
    const functions = functionsIn(
      "catalog.server.ts",
      /^(?:export )?async function /m,
    );
    const reads = [...functions].filter(([, body]) =>
      // Operations (fetch*) and the redirect lookup.
      /\b(fetch[A-Z]|findShopifyRedirect\()/.test(body),
    );
    expect(reads.length).toBeGreaterThan(0);
    for (const [name, body] of reads) {
      expect(body, name).toMatch(/"use cache(: remote)?"/);
    }
  });

  it("keeps the handle lists endpoints check in the shared remote cache", () => {
    const functions = functionsIn(
      "catalog.server.ts",
      /^(?:export )?async function /m,
    );
    for (const name of ["sharedProductHandles", "sharedCollectionHandles"]) {
      expect(functions.get(name), name).toContain('"use cache: remote"');
    }
    // Pages are prerendered, so their reads can't be remote.
    for (const name of ["listProductHandles", "listCollectionHandles"]) {
      expect(functions.get(name), name).not.toContain("remote");
    }
  });

  it("takes a PublicContext, never a BuyerContext", () => {
    type FirstParams = {
      [K in keyof typeof catalog]: Parameters<(typeof catalog)[K]>[0];
    }[keyof typeof catalog];
    expectTypeOf<FirstParams>().toEqualTypeOf<PublicContext>();
    expectTypeOf<BuyerContext>().not.toExtend<PublicContext>();
  });
});

describe("request-time routes", () => {
  // Their handle checks use the shared remote lists: the per-instance ones
  // would make a cold server instance list the whole catalog.
  it.each([
    "agent-text.server.ts",
    "variant-endpoint.server.ts",
    "browse-endpoint.server.ts",
    "recommendations-endpoint.server.ts",
    "quick-add-endpoint.server.ts",
    "cards-endpoint.server.ts",
  ])("%s uses only request-time catalog reads", (file) => {
    const source = readFileSync(join(import.meta.dirname, file), "utf8");
    for (const pageRead of [
      "getProductContent",
      "getDefaultVariantView",
      "getVariantOffers",
      "getCollection",
      "getProductRecommendations",
      "listProductHandles",
      "listCollectionHandles",
    ]) {
      expect(source, pageRead).not.toMatch(new RegExp(`\\b${pageRead}\\b`));
    }
  });
});

describe("pricing.server.ts", () => {
  it("never caches buyer-specific state", () => {
    const functions = exportedFunctions("pricing.server.ts");
    expect(functions.size).toBeGreaterThan(0);
    for (const [name, body] of functions) {
      expect(body, name).not.toContain("use cache");
    }
  });
});
