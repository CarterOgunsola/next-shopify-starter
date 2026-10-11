import "server-only";
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import type {
  Page,
  ProductCard,
  ProductContent,
  VariantOffer,
  VariantView,
} from "../../types";
import { storefrontRequest } from "../client.server";
import {
  ProductCardFragment,
  ProductContentFragment,
} from "../fragments/product";
import { toProductCard, toProductContent } from "../transforms/product";
import { toVariantView } from "../transforms/variant";
import { DefaultVariantFragment } from "./variants";

// Uncached. catalog.server.ts decides caching.

export const ProductContentQuery = gql(
  `
    query ProductContent(
      $handle: String!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      product(handle: $handle) {
        ...ProductContent
        ...DefaultVariant
      }
    }
  `,
  [ProductContentFragment, DefaultVariantFragment],
);

export type ProductContentData = NonNullable<
  StorefrontApi.ResultOf<typeof ProductContentQuery>["product"]
>;

// A product's content, its default variant (consumer price and stock, no
// selection) and every variant's offer, in one read. null when the handle doesn't exist or isn't
// published to the Headless channel.
export async function fetchProductContent(
  handle: string,
): Promise<ProductRead | null> {
  const data = await storefrontRequest(ProductContentQuery, {
    variables: { handle },
  });
  if (!data.product) return null;
  return {
    content: toProductContent(data.product),
    defaultView: toVariantView(data.product),
    offers: data.product.variants.nodes.map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku || null,
      gtin: variant.barcode || null,
      available: variant.availableForSale,
      price: variant.price,
      planPrices: variant.sellingPlanAllocations.nodes.flatMap((allocation) =>
        // The ongoing price, per delivery.
        allocation.priceAdjustments.slice(-1).map((a) => a.perDeliveryPrice),
      ),
      imageUrl: variant.image?.url ?? null,
      selectedOptions: variant.selectedOptions.map(({ name, value }) => ({
        name,
        value,
      })),
    })),
  };
}

// Everything a product page reads from Shopify, in one request.
export type ProductRead = {
  content: ProductContent;
  defaultView: VariantView;
  offers: VariantOffer[];
};

export const ProductCardsQuery = gql(
  `
    query ProductCards(
      $first: Int!
      $after: String
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      products(first: $first, after: $after, sortKey: TITLE) {
        nodes {
          ...ProductCard
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `,
  [ProductCardFragment],
);

export type ProductCardData = StorefrontApi.ResultOf<
  typeof ProductCardsQuery
>["products"]["nodes"][number];

// Every product published to the Headless channel, by title.
export async function fetchProductCards({
  first,
  after,
}: {
  first: number;
  after?: string;
}): Promise<Page<ProductCard>> {
  const { products } = await storefrontRequest(ProductCardsQuery, {
    variables: { first, after },
  });
  return {
    items: products.nodes.map((product) => toProductCard(product)),
    nextCursor: products.pageInfo.hasNextPage
      ? products.pageInfo.endCursor
      : null,
    previousCursor: null,
  };
}

// Every published product's handle, page by page.
export async function fetchProductHandles(): Promise<string[]> {
  const handles: string[] = [];
  let after: string | undefined;
  do {
    const page = await fetchProductCards({ first: 250, after });
    handles.push(...page.items.map((product) => product.handle));
    after = page.nextCursor ?? undefined;
  } while (after);
  return handles;
}

// Shopify's recommendations for a product (Search & Discovery): RELATED
// (similar products) or COMPLEMENTARY (goes with it, as set up in the
// app), consumer prices.
export const ProductRecommendationsQuery = gql(
  `
    query ProductRecommendations(
      $handle: String!
      $intent: ProductRecommendationIntent
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      productRecommendations(productHandle: $handle, intent: $intent) {
        ...ProductCard
      }
    }
  `,
  [ProductCardFragment],
);

export type RecommendationIntent = "RELATED" | "COMPLEMENTARY";

export async function fetchProductRecommendations(
  handle: string,
  intent: RecommendationIntent = "RELATED",
): Promise<ProductCard[]> {
  const { productRecommendations } = await storefrontRequest(
    ProductRecommendationsQuery,
    { variables: { handle, intent } },
  );
  return (productRecommendations ?? []).map((product) =>
    toProductCard(product),
  );
}

export const ProductCardByHandleQuery = gql(
  `
    query ProductCardByHandle(
      $handle: String!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      product(handle: $handle) {
        ...ProductCard
      }
    }
  `,
  [ProductCardFragment],
);

// One product's card (recently viewed), or null when it's gone.
export async function fetchProductCard(
  handle: string,
): Promise<ProductCard | null> {
  const { product } = await storefrontRequest(ProductCardByHandleQuery, {
    variables: { handle },
  });
  return product ? toProductCard(product) : null;
}
