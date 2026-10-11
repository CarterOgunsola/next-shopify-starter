import { HttpResponse } from "msw";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { server, shopify } from "@/lib/commerce/testing/msw";
import { ShopPolicyLinks } from "./shop-policy-links";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
vi.mock("@/lib/flags", () => ({ isShopEnabled: () => true }));

const policy = (handle: string, title: string) => ({
  id: `gid://shopify/ShopPolicy/${handle}`,
  handle,
  title,
  body: "<p>Synthetic.</p>",
  url: `https://synthetic-store.myshopify.com/policies/${handle}`,
});

describe("ShopPolicyLinks", () => {
  it("links the store's sales policies", async () => {
    server.use(
      shopify.operation(() =>
        HttpResponse.json({
          data: {
            shop: {
              refundPolicy: policy("refund-policy", "Refund policy"),
              shippingPolicy: policy("shipping-policy", "Shipping policy"),
              privacyPolicy: policy("privacy-policy", "Privacy policy"),
              termsOfService: null,
              subscriptionPolicy: null,
            },
          },
        }),
      ),
    );
    const html = renderToStaticMarkup(await ShopPolicyLinks());
    expect(html).toContain('href="/policies/refund-policy"');
    expect(html).toContain('href="/policies/shipping-policy"');
    expect(html).not.toContain("privacy-policy");
  });

  it.each([
    ["is down", () => HttpResponse.error()],
    ["answers 503", () => new HttpResponse(null, { status: 503 })],
  ])("renders nothing when Shopify %s", async (_, outage) => {
    server.use(shopify.operation(outage));
    expect(await ShopPolicyLinks()).toBeNull();
  });
});
