import { gql } from "@shopify/hydrogen";

// Queries used only by the fixture recorder.

// Every variant with its options and stock, to check the encoded-variant
// decoder against real data.
export const VariantMatrixQuery = gql(`
  query VariantMatrix($handle: String!) {
    product(handle: $handle) {
      options {
        name
        optionValues {
          name
        }
      }
      encodedVariantExistence
      encodedVariantAvailability
      variants(first: 250) {
        nodes {
          availableForSale
          selectedOptions {
            name
            value
          }
        }
      }
    }
  }
`);

// Variant and plan ids for recording cart fixtures.
export const CartFixtureIdsQuery = gql(`
  query CartFixtureIds {
    wax: product(handle: "selling-plans-ski-wax") {
      variants(first: 1) {
        nodes {
          id
        }
      }
      sellingPlanGroups(first: 1) {
        nodes {
          sellingPlans(first: 1) {
            nodes {
              id
            }
          }
        }
      }
    }
    soldOut: product(handle: "the-out-of-stock-snowboard") {
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
    planOnly: product(handle: "test-subscription-only") {
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
  }
`);

export const DiscountFixtureIdsQuery = gql(`
  query DiscountFixtureIds {
    tee: product(handle: "test-tee-3-option") {
      variants(first: 1) {
        nodes {
          id
        }
      }
    }
  }
`);

// Every product's allergens, for the launch check (pnpm launch:check).
export const SupplementAllergensQuery = gql(`
  query SupplementAllergens($after: String) {
    products(first: 250, after: $after) {
      nodes {
        handle
        allergens: metafield(namespace: "supplement", key: "allergens") {
          value
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);
