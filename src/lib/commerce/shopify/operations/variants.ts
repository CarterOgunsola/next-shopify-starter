import "server-only";
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import type { VariantView } from "../../types";
import { storefrontRequest } from "../client.server";
import { VariantStateFragment } from "../fragments/variant";
import { closestCombination, toVariantView } from "../transforms/variant";

// What a variant view reads from a product. Reused by the product content
// query with no selection, so a product page's content and default variant
// come from one Shopify read.
export const DefaultVariantFragment = gql(
  `
    fragment DefaultVariant on Product {
      id
      options {
        name
        optionValues {
          name
        }
      }
      encodedVariantExistence
      encodedVariantAvailability
      selectedOrFirstAvailableVariant(
        selectedOptions: []
        ignoreUnknownOptions: true
        caseInsensitiveMatch: true
      ) {
        ...VariantState
      }
    }
  `,
  [VariantStateFragment],
);

// Shopify resolves the selection: names and values match case-insensitively,
// unknown options are ignored, and an incomplete or unavailable selection
// falls back to the first available variant.
export const VariantViewQuery = gql(
  `
    query VariantView(
      $handle: String!
      $selectedOptions: [SelectedOptionInput!]!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      product(handle: $handle) {
        id
        options {
          name
          optionValues {
            name
          }
        }
        encodedVariantExistence
        encodedVariantAvailability
        selectedOrFirstAvailableVariant(
          selectedOptions: $selectedOptions
          ignoreUnknownOptions: true
          caseInsensitiveMatch: true
        ) {
          ...VariantState
        }
      }
    }
  `,
  [VariantStateFragment],
);

export type VariantViewData = NonNullable<
  StorefrontApi.ResultOf<typeof VariantViewQuery>["product"]
>;

// Uncached. null when the product doesn't exist or isn't published.
// requested: what the per-value flags are relative to (see toVariantView);
// the selection itself by default.
export async function fetchVariantView(
  handle: string,
  selectedOptions: { name: string; value: string }[],
  buyerIp: string | undefined,
  requested = selectedOptions,
): Promise<VariantView | null> {
  const data = await storefrontRequest(VariantViewQuery, {
    variables: { handle, selectedOptions },
    buyerIp,
  });
  return data.product ? toVariantView(data.product, requested) : null;
}

// The view for a selection plus the existing combination closest to it
// (see closestCombination), for when Shopify's pick drops a chosen value.
export async function fetchVariantResolution(
  handle: string,
  selectedOptions: { name: string; value: string }[],
  buyerIp: string | undefined,
): Promise<{
  view: VariantView;
  closest: { name: string; value: string }[] | null;
} | null> {
  const data = await storefrontRequest(VariantViewQuery, {
    variables: { handle, selectedOptions },
    buyerIp,
  });
  if (!data.product) return null;
  return {
    view: toVariantView(data.product, selectedOptions),
    closest: closestCombination(data.product, selectedOptions),
  };
}

export const VariantOptionsQuery = gql(`
  query VariantOptions($id: ID!) {
    node(id: $id) {
      ... on ProductVariant {
        selectedOptions {
          name
          value
        }
        product {
          handle
        }
      }
    }
  }
`);

// The options of a variant from a Shopify ?variant= link, if it belongs to
// this product.
export async function fetchVariantOptions(
  handle: string,
  variantId: string,
  buyerIp: string | undefined,
): Promise<{ name: string; value: string }[] | null> {
  const { node } = await storefrontRequest(VariantOptionsQuery, {
    variables: { id: `gid://shopify/ProductVariant/${variantId}` },
    buyerIp,
  });
  if (!node || !("product" in node) || node.product.handle !== handle) {
    return null;
  }
  return node.selectedOptions.map(({ name, value }) => ({ name, value }));
}
