import { describe, expect, it } from "vitest";
import { productContent } from "./testing/factories";
import {
  collectionMarkdown,
  htmlToMarkdown,
  productMarkdown,
} from "./markdown";
import { toProductCard } from "./shopify/transforms/product";
import cards from "./testing/fixtures/ProductCards.first-page.json";

describe("htmlToMarkdown", () => {
  it("turns sanitized rich text into Markdown", () => {
    expect(
      htmlToMarkdown(
        '<h3>Use</h3><p>Mix <strong>one</strong> scoop &amp; <em>stir</em>.</p><ul><li>Lemon</li><li>Berry</li></ul><p><a href="https://x.test">More</a></p>',
      ),
    ).toBe(
      "### Use\n\nMix **one** scoop & _stir_.\n\n- Lemon\n- Berry\n\n[More](https://x.test)",
    );
  });
});

describe("productMarkdown", () => {
  it("gives the title, URL, options and description", () => {
    const product = productContent("tee");
    const md = productMarkdown(product, null, "https://shop.test");
    expect(md.startsWith(`# ${product.title}\n`)).toBe(true);
    expect(md).toContain(`URL: https://shop.test/products/${product.handle}`);
    expect(md).toContain("Color: ");
    expect(md).toContain("## Description");
  });
});

describe("collectionMarkdown", () => {
  it("lists a subscription-only product at its plan price", () => {
    const products = cards.data.products.nodes.map((node) =>
      toProductCard(node as unknown as Parameters<typeof toProductCard>[0]),
    );
    const md = collectionMarkdown(
      {
        id: "gid://shopify/Collection/1",
        handle: "all",
        title: "All",
        descriptionHtml: "",
        image: null,
        seo: { title: "All", description: "" },
      },
      {
        products: { items: products, nextCursor: null, previousCursor: null },
        facets: [],
        totalCount: products.length,
      } as unknown as Parameters<typeof collectionMarkdown>[1],
      "https://shop.test",
    );
    const line = md
      .split("\n")
      .find((l) => l.includes("/products/test-subscription-only"));
    expect(line).toContain("$31.50");
    expect(line).not.toContain("$35.00");
    // Recorded with a Prop 65 warning.
    expect(line).toContain(
      "(California Prop 65 warning: see the product page)",
    );
    expect(
      md.split("\n").find((l) => l.includes("/products/test-backorder")),
    ).not.toContain("Prop 65");
  });
});
