import { describe, expect, it } from "vitest";
import complete from "./testing/fixtures/ProductContent.the-videographer-snowboard.json";
import tee from "./testing/fixtures/ProductContent.test-tee-3-option.json";
import subscriptionOnly from "./testing/fixtures/ProductContent.test-subscription-only.json";
import type { ProductContentData } from "./shopify/operations/products";
import { toProductContent } from "./shopify/transforms/product";
import { productBreadcrumbsJsonLd, productJsonLd } from "./structured-data";
import type { VariantOffer } from "./types";

const snowboard = () =>
  toProductContent(complete.data.product as ProductContentData);

describe("productJsonLd", () => {
  it("describes a product without options as one Product", () => {
    const product = snowboard();
    const url = "https://example.test/products/the-videographer-snowboard";
    expect(productJsonLd(product, url, null)).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "The Videographer Snowboard",
      url,
      image: [
        expect.stringMatching(/^https:\/\/cdn\.shopify\.com\/.*Main\.jpg/),
      ],
    });
  });

  it("adds the default variant as an offer", () => {
    const ld = productJsonLd(snowboard(), "https://example.test/p", {
      id: "gid://shopify/ProductVariant/1",
      title: "Default Title",
      sku: null,
      selectedOptions: [],
      available: false,
      price: { amount: "885.95", currencyCode: "USD" },
      sellingPlanPrices: [],
    }) as { offers?: unknown };
    expect(ld.offers).toEqual({
      "@type": "Offer",
      url: "https://example.test/p",
      price: "885.95",
      priceCurrency: "USD",
      availability: "https://schema.org/OutOfStock",
    });
  });

  it("describes a product with options as a ProductGroup of variant offers", () => {
    const product = toProductContent(tee.data.product as ProductContentData);
    const usd = (amount: string) => ({
      amount,
      currencyCode: "USD" as const,
    });
    const offers: VariantOffer[] = [
      {
        id: "gid://shopify/ProductVariant/11",
        title: "Black / XS / Regular",
        sku: "TEE-BLK-XS",
        gtin: "012345678905",
        available: true,
        price: usd("38.0"),
        planPrices: [],
        imageUrl: null,
        selectedOptions: [
          { name: "Color", value: "Black" },
          { name: "Size", value: "XS" },
          { name: "Fit", value: "Regular" },
        ],
      },
      {
        id: "gid://shopify/ProductVariant/12",
        title: "Forest / XS / Regular",
        sku: null,
        gtin: "not-a-gtin",
        available: false,
        price: usd("38.0"),
        planPrices: [],
        imageUrl: "https://cdn.shopify.com/s/files/forest.jpg",
        selectedOptions: [
          { name: "Color", value: "Forest" },
          { name: "Size", value: "XS" },
          { name: "Fit", value: "Regular" },
        ],
      },
    ];
    const url = "https://example.test/products/test-tee-3-option";
    const ld = productJsonLd(product, url, null, offers) as Record<
      string,
      unknown
    >;
    expect(ld["@type"]).toBe("ProductGroup");
    expect(ld.variesBy).toEqual([
      "https://schema.org/color",
      "https://schema.org/size",
    ]);
    const [black, forest] = ld.hasVariant as Record<string, unknown>[];
    expect(black).toMatchObject({
      "@type": "Product",
      sku: "TEE-BLK-XS",
      gtin: "012345678905",
      color: "Black",
      size: "XS",
      offers: {
        url: `${url}?variant=11`,
        availability: "https://schema.org/InStock",
      },
    });
    expect(forest).not.toHaveProperty("gtin");
    expect(forest.image).toBe("https://cdn.shopify.com/s/files/forest.jpg");
  });
});

describe("subscription-only products", () => {
  it("offer the plan price, the only one that can be bought", () => {
    const product = toProductContent(
      subscriptionOnly.data.product as ProductContentData,
    );
    expect(product.requiresSellingPlan).toBe(true);
    const ld = productJsonLd(product, "https://example.test/p", {
      id: "gid://shopify/ProductVariant/1",
      title: "Default Title",
      sku: null,
      selectedOptions: [],
      available: true,
      price: { amount: "35.0", currencyCode: "USD" },
      sellingPlanPrices: [
        {
          planId: "gid://shopify/SellingPlan/1",
          price: { amount: "31.5", currencyCode: "USD" },
        },
        {
          planId: "gid://shopify/SellingPlan/2",
          price: { amount: "33.25", currencyCode: "USD" },
        },
      ],
    }) as { offers?: { price: string } };
    expect(ld.offers?.price).toBe("31.5");
  });

  it("use each variant's plan price in a ProductGroup", () => {
    const product = {
      ...toProductContent(subscriptionOnly.data.product as ProductContentData),
      options: [{ name: "Size", values: [{ name: "S" }, { name: "L" }] }],
    };
    const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
    const variant = (
      id: string,
      price: string,
      plan: string,
    ): VariantOffer => ({
      id: `gid://shopify/ProductVariant/${id}`,
      title: id,
      sku: null,
      gtin: null,
      available: true,
      price: usd(price),
      planPrices: [usd(plan)],
      imageUrl: null,
      selectedOptions: [{ name: "Size", value: id }],
    });
    const ld = productJsonLd(product, "https://example.test/p", null, [
      variant("S", "35.0", "31.5"),
      variant("L", "60.0", "54.0"),
    ]) as { hasVariant: { offers: { price: string } }[] };
    expect(ld.hasVariant.map((v) => v.offers.price)).toEqual(["31.5", "54.0"]);
  });
});

describe("productBreadcrumbsJsonLd", () => {
  it("lists Home, Shop and the product", () => {
    const ld = productBreadcrumbsJsonLd(
      { title: "Test Tee" },
      "https://example.test",
      "https://example.test/products/test-tee-3-option",
    );
    expect(ld.itemListElement.map((i) => [i.position, i.name, i.item])).toEqual(
      [
        [1, "Home", "https://example.test/"],
        [2, "Shop", "https://example.test/shop"],
        [3, "Test Tee", "https://example.test/products/test-tee-3-option"],
      ],
    );
  });
});
