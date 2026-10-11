import { gql } from "@shopify/hydrogen";
import { ImageFragment } from "./media";
import { MoneyFragment } from "./variant";

export const CartFragment = gql(
  `
    fragment Cart on Cart {
      id
      updatedAt
      checkoutUrl
      totalQuantity
      note
      attributes {
        key
        value
      }
      cost {
        subtotalAmount {
          ...Money
        }
        totalAmount {
          ...Money
        }
        # What checkout charges now: lower than the total when a selling
        # plan bills later.
        checkoutChargeAmount {
          ...Money
        }
      }
      discountCodes {
        code
        applicable
      }
      # Gift cards applied to the cart, by their last characters only.
      appliedGiftCards {
        id
        lastCharacters
        amountUsed {
          ...Money
        }
        balance {
          ...Money
        }
      }
      lines(first: 250) {
        nodes {
          id
          quantity
          attributes {
            key
            value
          }
          # Set for add-ons and bundle components attached to another line.
          ... on CartLine {
            parentRelationship {
              parent {
                id
              }
            }
          }
          merchandise {
            __typename
            ... on ProductVariant {
              id
              title
              sku
              quantityRule {
                minimum
                maximum
                increment
              }
              image {
                ...Image
              }
              selectedOptions {
                name
                value
              }
              product {
                id
                handle
                title
                vendor
                productType
                requiresSellingPlan
                isGiftCard
              }
              # The plans the line can switch to, priced per delivery (a
              # prepaid plan's price is for all its deliveries).
              sellingPlanAllocations(first: 10) {
                nodes {
                  sellingPlan {
                    id
                    name
                    recurringDeliveries
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
          }
          sellingPlanAllocation {
            sellingPlan {
              id
              name
            }
          }
          # Line-level only: these are already in the line total.
          discountAllocations(lineLevelOnly: true) {
            discountedAmount {
              ...Money
            }
            ... on CartCodeDiscountAllocation {
              code
            }
            ... on CartAutomaticDiscountAllocation {
              title
            }
            ... on CartCustomDiscountAllocation {
              title
            }
          }
          # Every discount on the line, order-level ones included. The cart
          # summary's order discounts are these minus the line-level ones
          # (Shopify's replacement for the deprecated Cart.discountAllocations).
          allDiscountAllocations: discountAllocations(lineLevelOnly: false) {
            discountedAmount {
              ...Money
            }
            ... on CartCodeDiscountAllocation {
              code
            }
            ... on CartAutomaticDiscountAllocation {
              title
            }
            ... on CartCustomDiscountAllocation {
              title
            }
          }
          cost {
            amountPerQuantity {
              ...Money
            }
            compareAtAmountPerQuantity {
              ...Money
            }
            totalAmount {
              ...Money
            }
          }
        }
      }
    }
  `,
  [MoneyFragment, ImageFragment],
);

// Every cart mutation returns these.
export const CartPayloadFragment = gql(`
  fragment CartPayloadErrors on CartUserError {
    code
    field
    message
  }
`);
