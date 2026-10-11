import { describe, expect, it } from "vitest";
import { storefrontRequest } from "../shopify/client.server";
import { SupplementAllergensQuery } from "../shopify/operations/fixture-queries";
import { readAllergens } from "../shopify/transforms/supplement";

// pnpm launch:check, against the store in .env.local: every product's
// allergens must read cleanly (each one of the nine, with its kind for tree
// nuts, fish and shellfish), since the label states them.
describe.runIf(process.env.LAUNCH_CHECK === "1")("supplement labels", () => {
  it("state every allergen cleanly", async () => {
    const problems: string[] = [];
    let after: string | undefined;
    do {
      const { products } = await storefrontRequest(SupplementAllergensQuery, {
        variables: { after },
      });
      for (const product of products.nodes) {
        for (const problem of readAllergens(product.allergens?.value)
          .problems) {
          problems.push(`${product.handle}: ${problem}`);
        }
      }
      after = products.pageInfo.hasNextPage
        ? (products.pageInfo.endCursor ?? undefined)
        : undefined;
    } while (after);
    expect(problems).toEqual([]);
  }, 60_000);
});
