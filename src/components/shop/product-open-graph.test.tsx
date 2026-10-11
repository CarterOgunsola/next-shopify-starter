import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { productContent } from "@/lib/commerce/testing/factories";
import type { VariantView } from "@/lib/commerce";
import { ProductOpenGraph } from "./product-open-graph";

const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
const view = (price: string, plans: string[]) =>
  ({
    variant: {
      price: usd(price),
      sellingPlanPrices: plans.map((plan, i) => ({
        planId: `gid://shopify/SellingPlan/${i}`,
        price: usd(plan),
      })),
    },
  }) as unknown as VariantView;

describe("ProductOpenGraph", () => {
  it("renders Open Graph's product tags as property=, which readers need", () => {
    const html = renderToStaticMarkup(
      <ProductOpenGraph
        product={productContent("tee")}
        view={view("38.0", [])}
      />,
    );
    expect(html).toBe(
      '<meta property="og:type" content="product"/>' +
        '<meta property="product:price:amount" content="38.0"/>' +
        '<meta property="product:price:currency" content="USD"/>',
    );
  });

  it("gives a subscription-only product's plan price", () => {
    const html = renderToStaticMarkup(
      <ProductOpenGraph
        product={{ ...productContent("tee"), requiresSellingPlan: true }}
        view={view("35.0", ["33.25", "31.5"])}
      />,
    );
    expect(html).toContain('property="product:price:amount" content="31.5"');
  });
});
