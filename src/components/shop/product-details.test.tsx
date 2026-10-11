import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  productContent,
  productFixtureNames,
  type ProductFixture,
} from "@/lib/commerce/testing/factories";
import { ProductDetails } from "./product-details";

function render(name: ProductFixture) {
  return renderToStaticMarkup(
    <ProductDetails product={productContent(name)} />,
  );
}

describe("ProductDetails", () => {
  it.each(productFixtureNames)("renders %s without throwing", (name) => {
    expect(render(name)).toContain("<h1>");
  });

  it("sizes images through Shopify's CDN", () => {
    const html = render("complete");
    expect(html).toMatch(/src="https:\/\/cdn\.shopify\.com\/[^"]*width=\d+/);
    expect(html).not.toContain("/_next/image");
  });

  it("links external video instead of embedding it", () => {
    const html = render("videographer");
    expect(html).toContain('href="https://www.youtube.com/embed/0jeoo7Ol3aI"');
    expect(html).not.toContain("<iframe");
  });

  it("puts the DSHEA disclaimer right after the claims, both marked", () => {
    // Recorded: electrolytes makes one structure/function claim.
    const html = render("electrolytes");
    const section = html.match(
      /<section aria-labelledby="description"[^>]*>([\s\S]*?)<\/section>/,
    );
    expect(section?.[0]).toContain('aria-describedby="dshea-disclaimer"');
    expect(section?.[1]).toMatch(
      /<h2 id="description">Description<span aria-hidden="true">\*<\/span><\/h2><div>[\s\S]*<\/div><p id="dshea-disclaimer"><span aria-hidden="true">\* <\/span>/,
    );
    // Before the Supplement Facts, not after them.
    expect(html.indexOf("dshea-disclaimer")).toBeLessThan(
      html.indexOf("Supplement Facts"),
    );
  });

  it("shows the Prop 65 warning before the purchase controls", () => {
    // Recorded: the creatine carries a Prop 65 warning (lead).
    const html = renderToStaticMarkup(
      <ProductDetails product={productContent("creatine")}>
        <button type="button">Add to cart</button>
      </ProductDetails>,
    );
    const warning = html.indexOf(
      'aria-label="California Proposition 65 warning"',
    );
    expect(warning).toBeGreaterThan(-1);
    expect(warning).toBeLessThan(html.indexOf("Add to cart"));
    // Once on the page.
    expect(html.split("California Proposition 65 warning")).toHaveLength(2);
  });

  it("renders a product with no media", () => {
    expect(render("minimal")).not.toContain("Product media");
  });
});
