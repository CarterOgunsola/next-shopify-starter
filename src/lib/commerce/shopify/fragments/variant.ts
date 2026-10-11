import { gql } from "@shopify/hydrogen";

export const MoneyFragment = gql(`
  fragment Money on MoneyV2 {
    amount
    currencyCode
  }
`);

// Buyer-specific: price, stock and plan prices. Never shared-cached.
export const VariantStateFragment = gql(
  `
    fragment VariantState on ProductVariant {
      id
      title
      sku
      availableForSale
      # Units left, for "Only N left": null unless the token may read
      # inventory; 0 when the variant isn't tracked or is on backorder.
      quantityAvailable
      currentlyNotInStock
      selectedOptions {
        name
        value
      }
      price {
        ...Money
      }
      compareAtPrice {
        ...Money
      }
      quantityRule {
        minimum
        maximum
        increment
      }
      sellingPlanAllocations(first: 20) {
        nodes {
          sellingPlan {
            id
          }
          checkoutChargeAmount {
            ...Money
          }
          priceAdjustments {
            price {
              ...Money
            }
            compareAtPrice {
              ...Money
            }
            perDeliveryPrice {
              ...Money
            }
          }
        }
      }
    }
  `,
  [MoneyFragment],
);
