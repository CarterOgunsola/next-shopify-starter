import { gql } from "@shopify/hydrogen";
import { ImageFragment, MediaFragment } from "./media";
import { MoneyFragment } from "./variant";

// Shopify's standard product review metafields, written by the review app
// (any app in Shopify's review program), with storefront access.
export const ReviewSummaryFragment = gql(`
  fragment ReviewSummary on Product {
    reviewRating: metafield(namespace: "reviews", key: "rating") {
      value
    }
    reviewCount: metafield(namespace: "reviews", key: "rating_count") {
      value
    }
  }
`);

// What product badges are built from besides price and stock: when it was
// published ("New") and the merchant's own badges, a list of "badge"
// metaobjects (a "label" field each) in the product's custom.badges
// metafield. Tags are never read for badges.
export const ProductBadgesFragment = gql(`
  fragment ProductBadges on Product {
    publishedAt
    merchantBadges: metafield(namespace: "custom", key: "badges") {
      references(first: 5) {
        nodes {
          ... on Metaobject {
            label: field(key: "label") {
              value
            }
          }
        }
      }
    }
  }
`);

// Buyer-neutral product content: safe to cache and share. Prices and
// availability are in the variant-state fragment (variant.ts).
export const ProductContentFragment = gql(
  `
    fragment ProductContent on Product {
      id
      isGiftCard
      handle
      title
      vendor
      productType
      description
      descriptionHtml
      options {
        name
        optionValues {
          name
          swatch {
            color
          }
        }
      }
      media(first: 20) {
        nodes {
          ...Media
        }
      }
      seo {
        title
        description
      }
      requiresSellingPlan
      # Every variant: images for the gallery, and consumer offers for
      # structured data.
      variants(first: 250) {
        nodes {
          id
          title
          sku
          barcode
          availableForSale
          # Fields spelled out: the Money fragment already comes in through
          # the default variant, and a query can't repeat a fragment.
          price {
            amount
            currencyCode
          }
          compareAtPrice {
            amount
            currencyCode
          }
          # Per delivery: a prepaid plan's price is for all its deliveries.
          sellingPlanAllocations(first: 10) {
            nodes {
              priceAdjustments {
                perDeliveryPrice {
                  amount
                  currencyCode
                }
              }
            }
          }
          selectedOptions {
            name
            value
          }
          image {
            url
          }
        }
      }
      sellingPlanGroups(first: 10) {
        nodes {
          name
          sellingPlans(first: 10) {
            nodes {
              id
              name
              description
              recurringDeliveries
              # Two adjustments: an introductory price for the first
              # orderCount orders, then the second.
              priceAdjustments {
                orderCount
              }
            }
          }
        }
      }
      # The review app's rating, in Shopify's standard review metafields.
      ...ReviewSummary
      ...ProductBadges
    }
  `,
  [MediaFragment, ReviewSummaryFragment, ProductBadgesFragment],
);

// Listing tile with the consumer price range.
export const ProductCardFragment = gql(
  `
    fragment ProductCard on Product {
      id
      handle
      title
      availableForSale
      # Set only in search results: Shopify's search analytics params.
      trackingParameters
      featuredImage {
        ...Image
      }
      priceRange {
        minVariantPrice {
          ...Money
        }
        maxVariantPrice {
          ...Money
        }
      }
      ...ReviewSummary
      ...ProductBadges
      # A subscription-only product is sold at its plan prices: read across
      # its first 10 variants for a "From" price.
      requiresSellingPlan
      isGiftCard
      # Shopify's compareAtPriceRange skips variants without a compare-at
      # price, so a sale is read off the variants themselves.
      variants(first: 10) {
        pageInfo {
          hasNextPage
        }
        nodes {
          # A single available variant can be added from the card.
          id
          availableForSale
          price {
            ...Money
          }
          compareAtPrice {
            ...Money
          }
          # Per delivery: a prepaid plan's price is for all its deliveries.
          sellingPlanAllocations(first: 5) {
            nodes {
              priceAdjustments {
                perDeliveryPrice {
                  ...Money
                }
              }
            }
          }
        }
      }
    }
  `,
  [ImageFragment, MoneyFragment, ReviewSummaryFragment, ProductBadgesFragment],
);
