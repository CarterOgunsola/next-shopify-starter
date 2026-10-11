import { describe, expect, it } from "vitest";
import tee from "../../testing/fixtures/ProductContent.test-tee-3-option.json";
import longTitle from "../../testing/fixtures/ProductContent.test-long-title.json";
import complete from "../../testing/fixtures/ProductContent.the-complete-snowboard.json";
import minimal from "../../testing/fixtures/ProductContent.the-minimal-snowboard.json";
import skiWax from "../../testing/fixtures/ProductContent.selling-plans-ski-wax.json";
import videographer from "../../testing/fixtures/ProductContent.the-videographer-snowboard.json";
import type {
  ProductCardData,
  ProductContentData,
} from "../operations/products";
import { toProductCard, toProductContent } from "./product";

const product = (fixture: { data: { product: unknown } }) =>
  toProductContent(fixture.data.product as ProductContentData);

describe("toProductContent", () => {
  it("maps options and values", () => {
    const content = product(complete);
    expect(content.handle).toBe("the-complete-snowboard");
    expect(content.options).toEqual([
      {
        name: "Color",
        values: [
          { name: "Dawn" },
          { name: "Powder" },
          { name: "Electric" },
          { name: "Sunset" },
          { name: "Ice" },
        ],
      },
    ]);
  });

  it("keeps swatch colors when a value has one", () => {
    const withSwatch = structuredClone(complete.data.product);
    (withSwatch.options[0].optionValues[0] as { swatch: unknown }).swatch = {
      color: "#f4b860",
    };
    const [color] = toProductContent(withSwatch as ProductContentData).options;
    expect(color.values[0]).toEqual({ name: "Dawn", swatch: "#f4b860" });
    expect(color.values[1]).toEqual({ name: "Powder" });
  });

  it("drops Shopify's placeholder option on single-variant products", () => {
    expect(product(videographer).options).toEqual([]);
  });

  it("maps images with their alt text", () => {
    const [first] = product(complete).media;
    expect(first.kind).toBe("image");
    if (first.kind === "image") {
      expect(first.image.url).toMatch(/^https:\/\/cdn\.shopify\.com\//);
      expect(first.image.width).toBeGreaterThan(0);
    }
  });

  it("maps external video with its preview image", () => {
    const video = product(videographer).media.find(
      (media) => media.kind === "externalVideo",
    );
    expect(video).toMatchObject({
      kind: "externalVideo",
      embedUrl: "https://www.youtube.com/embed/0jeoo7Ol3aI",
      alt: "Video of the Snowboard.",
    });
    expect(video && "preview" in video && video.preview?.url).toBeTruthy();
  });

  it("keeps selling plan groups without prices", () => {
    const groups = product(skiWax).sellingPlanGroups;
    expect(groups.length).toBeGreaterThan(0);
    for (const plan of groups.flatMap((group) => group.plans)) {
      expect(plan.id).toMatch(/^gid:\/\/shopify\/SellingPlan\//);
      // Plan terms only: prices are buyer-specific (VariantState).
      expect(Object.keys(plan).sort()).toEqual([
        "description",
        "id",
        "introOrders",
        "name",
        "recurring",
      ]);
    }
  });

  it("handles a product with no media and falls back for SEO", () => {
    const content = product(minimal);
    expect(content.media).toEqual([]);
    expect(content.seo.title).toBe(content.title);
  });

  it("truncates long descriptions for the SEO fallback", () => {
    const long = {
      ...complete.data.product,
      seo: { title: null, description: null },
      description: `${"word ".repeat(60)}end`,
    };
    const { seo } = toProductContent(long as ProductContentData);
    expect(seo.description.length).toBeLessThanOrEqual(160);
    expect(seo.description.endsWith("…")).toBe(true);
    expect(seo.description).not.toMatch(/\s…$/);
  });
});

describe("variant images and alt text", () => {
  it("records which image goes with which options", () => {
    const { variantImages } = product(tee);
    expect(variantImages.length).toBeGreaterThan(0);
    const urls = new Set(variantImages.map((image) => image.url));
    // Per-color images on the tee.
    expect(urls.size).toBeGreaterThan(1);
    expect(Object.keys(variantImages[0].options).sort()).toEqual([
      "Color",
      "Fit",
      "Size",
    ]);
  });

  it("describes images without alt text by the product title", () => {
    const raw = structuredClone(complete.data.product) as ProductContentData;
    for (const node of raw.media.nodes) {
      node.alt = "";
      if ("image" in node && node.image) node.image.altText = null;
    }
    const [first] = toProductContent(raw).media;
    expect(first.kind === "image" && first.image.altText).toBe(
      "The Complete Snowboard",
    );
  });
});

describe("descriptions from the store", () => {
  it("never carry scripts through", () => {
    const raw = longTitle.data.product.descriptionHtml;
    expect(raw).toMatch(/<script/i);
    const { descriptionHtml, title } = product(longTitle);
    expect(descriptionHtml).not.toMatch(/<script|alert\(/i);
    expect(descriptionHtml).toContain("<table>");
    // Titles are plain text; React escapes them.
    expect(title).toContain("<b>not bold</b>");
  });
});

describe("toProductCard", () => {
  const usd = (amount: string) => ({ amount, currencyCode: "USD" as const });
  type CardVariant = ProductCardData["variants"]["nodes"][number];
  const variant = (over: Partial<CardVariant> = {}): CardVariant => ({
    id: "gid://shopify/ProductVariant/1",
    availableForSale: true,
    price: usd("10.0"),
    compareAtPrice: null,
    sellingPlanAllocations: {
      nodes: [{ priceAdjustments: [{ perDeliveryPrice: usd("9.0") }] }],
    },
    ...over,
  });
  const variants = (nodes: CardVariant[], hasNextPage = false) => ({
    pageInfo: { hasNextPage },
    nodes,
  });
  const card: ProductCardData = {
    id: "gid://shopify/Product/1",
    handle: "synthetic",
    title: "Synthetic",
    availableForSale: false,
    trackingParameters: "_pos=1&_sid=abc&_ss=r",
    featuredImage: null,
    priceRange: { minVariantPrice: usd("10.0"), maxVariantPrice: usd("20.0") },
    requiresSellingPlan: false,
    reviewRating: null,
    reviewCount: null,
    isGiftCard: false,
    publishedAt: "2020-01-01T00:00:00Z",
    merchantBadges: null,
    prop65: [null, null],
    variants: variants([variant()]),
  };
  const onSale = { ...card, availableForSale: true };
  const single = {
    minVariantPrice: usd("10.0"),
    maxVariantPrice: usd("10.0"),
  };

  it("keeps the consumer price range and availability", () => {
    expect(toProductCard(card)).toEqual({
      id: "gid://shopify/Product/1",
      handle: "synthetic",
      title: "Synthetic",
      featuredImage: null,
      price: { min: usd("10.0"), max: usd("20.0") },
      available: false,
      trackingParameters: "_pos=1&_sid=abc&_ss=r",
      reviews: null,
      isGiftCard: false,
      quickAddVariantId: "gid://shopify/ProductVariant/1",
      prop65: null,
      badges: [{ kind: "soldOut", label: "Sold out" }],
    });
  });

  it("builds badges from the card's data and the merchant's metaobjects", () => {
    expect(
      toProductCard(
        {
          ...onSale,
          priceRange: single,
          variants: variants([variant({ compareAtPrice: usd("12.5") })]),
          publishedAt: "2026-10-01T00:00:00Z",
          merchantBadges: {
            references: { nodes: [{ label: { value: "Best seller" } }, {}] },
          },
        },
        { now: Date.parse("2026-10-09T00:00:00Z") },
      ).badges,
    ).toEqual([
      { kind: "sale", label: "Save 20%" },
      { kind: "new", label: "New" },
      { kind: "subscription", label: "Subscription available" },
      { kind: "merchant", label: "Best seller" },
    ]);
  });

  it("is on sale only when every variant has a higher compare-at", () => {
    const sale = (nodes: CardVariant[], hasNextPage = false) => {
      const result = toProductCard({
        ...onSale,
        priceRange: single,
        variants: variants(nodes, hasNextPage),
      });
      return {
        compareAtMin: result.price.compareAtMin,
        badges: result.badges?.filter((b) => b.kind === "sale"),
      };
    };
    const at = (amount: string, id = "1") =>
      variant({
        id: `gid://shopify/ProductVariant/${id}`,
        compareAtPrice: usd(amount),
      });
    expect(sale([at("15.0"), at("15.0", "2")])).toEqual({
      compareAtMin: usd("15.0"),
      badges: [{ kind: "sale", label: "Save 33%" }],
    });
    // Different compare-ats: a sale, but no single percentage.
    expect(sale([at("15.0"), at("12.5", "2")])).toEqual({
      compareAtMin: usd("12.5"),
      badges: [{ kind: "sale", label: "Sale" }],
    });
    // One variant without a compare-at (Shopify's compareAtPriceRange
    // would still report the other's), one at or below its price, or
    // variants not read: no sale claimed.
    const none = { compareAtMin: undefined, badges: [] };
    expect(sale([at("15.0"), variant({ id: "x" })])).toEqual(none);
    expect(sale([at("15.0"), at("10.0", "2")])).toEqual(none);
    expect(sale([at("15.0")], true)).toEqual(none);
    // A plan-only product's card price is a plan price.
    expect(
      toProductCard({
        ...onSale,
        requiresSellingPlan: true,
        variants: variants([at("15.0")]),
      }).price.compareAtMin,
    ).toBeUndefined();
  });

  const plans = (...prices: string[][]) =>
    variants(
      prices.map((plan, index) =>
        variant({
          id: `gid://shopify/ProductVariant/${index + 1}`,
          sellingPlanAllocations: {
            nodes: plan.map((price) => ({
              priceAdjustments: [{ perDeliveryPrice: usd(price) }],
            })),
          },
        }),
      ),
    );

  it("prices a subscription-only product at its lowest plan price", () => {
    const subscription = toProductCard({
      ...card,
      requiresSellingPlan: true,
      variants: plans(["8.5"]),
    });
    expect(subscription.price).toEqual({ min: usd("8.5"), max: usd("8.5") });
    // Two plans at different prices (monthly, every two months): From.
    expect(
      toProductCard({
        ...card,
        requiresSellingPlan: true,
        variants: plans(["9.5", "8.5"]),
      }).price,
    ).toEqual({ min: usd("8.5"), max: usd("9.5") });
    // Optional plans don't change a product that can be bought once.
    expect(toProductCard(card).price.min).toEqual(usd("10.0"));
  });

  it("gives a range of plan prices across a subscription-only product's variants", () => {
    const subscription = toProductCard({
      ...card,
      requiresSellingPlan: true,
      variants: plans(["31.5", "33.25"], ["54.0", "57.0"]),
    });
    expect(subscription.price).toEqual({ min: usd("31.5"), max: usd("57.0") });
  });

  it("offers quick add only for a lone, available variant needing no choices", () => {
    const lone = variant({
      id: "gid://shopify/ProductVariant/9",
      sellingPlanAllocations: { nodes: [] },
    });
    const one = (over: Partial<ProductCardData> = {}) =>
      toProductCard({ ...card, variants: variants([lone]), ...over })
        .quickAddVariantId;
    expect(one()).toBe("gid://shopify/ProductVariant/9");
    expect(one({ requiresSellingPlan: true })).toBeNull();
    expect(one({ isGiftCard: true })).toBeNull();
    // A Prop 65 product is added where its warning shows.
    const prop65 = toProductCard({
      ...card,
      variants: variants([lone]),
      prop65: [
        { key: "prop65_warning", value: "true" },
        { key: "prop65_chemical", value: "lead" },
      ],
    });
    expect(prop65.quickAddVariantId).toBeNull();
    expect(prop65.prop65).toEqual({ chemical: "lead" });
    expect(
      one({ variants: variants([{ ...lone, availableForSale: false }]) }),
    ).toBeNull();
    expect(toProductCard(card).quickAddVariantId).toBe(
      "gid://shopify/ProductVariant/1",
    );
    expect(
      toProductCard({
        ...card,
        variants: variants([
          variant(),
          variant({ id: "gid://shopify/ProductVariant/2" }),
        ]),
      }).quickAddVariantId,
    ).toBeNull();
  });
});
