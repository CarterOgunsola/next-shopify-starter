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

  it("renders a product with no media", () => {
    expect(render("minimal")).not.toContain("Product media");
  });
});
