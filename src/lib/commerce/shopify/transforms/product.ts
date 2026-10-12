import { productBadges } from "../../badges";
import { purchasePrice } from "../../money";
import type { Media, Money, ProductCard, ProductContent } from "../../types";
import type {
  ProductCardData,
  ProductContentData,
} from "../operations/products";
import { sanitizeRichText } from "./html";
import { toImage, toMedia } from "./media";
import { toReviewSummary } from "./reviews";

const SEO_DESCRIPTION_LENGTH = 160;

// The merchant's badge labels from the custom.badges metaobject list.
function merchantLabels(product: {
  merchantBadges: {
    references: {
      nodes: ({ label?: { value: string } | null } | object)[];
    } | null;
  } | null;
}): (string | undefined)[] {
  return (product.merchantBadges?.references?.nodes ?? []).map((node) =>
    "label" in node ? node.label?.value : undefined,
  );
}

// now: for "New" (tests pass a fixed time). An options object, so passing
// the transform straight to Array.map can't feed it the index.
type TransformOptions = { now?: number };

export function toProductContent(
  product: ProductContentData,
  { now = Date.now() }: TransformOptions = {},
): ProductContent {
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    vendor: product.vendor,
    productType: product.productType,
    // Shown under the product page's Description h2.
    descriptionHtml: sanitizeRichText(product.descriptionHtml, 2),
    options: product.options
      .filter((option) => !isPlaceholderOption(option))
      .map((option) => ({
        name: option.name,
        values: option.optionValues.map((value) => ({
          name: value.name,
          ...(value.swatch?.color ? { swatch: value.swatch.color } : {}),
        })),
      })),
    media: product.media.nodes
      .map(toMedia)
      .filter((media) => media !== null)
      .map((media) => withAltFallback(media, product.title)),
    seo: {
      title: product.seo.title || product.title,
      description:
        product.seo.description ||
        truncate(product.description, SEO_DESCRIPTION_LENGTH),
    },
    sellingPlanGroups: product.sellingPlanGroups.nodes.map((group) => ({
      name: group.name,
      plans: group.sellingPlans.nodes.map((plan) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description ?? null,
        recurring: plan.recurringDeliveries,
        introOrders:
          plan.priceAdjustments.length > 1
            ? (plan.priceAdjustments[0].orderCount ?? null)
            : null,
      })),
    })),
    requiresSellingPlan: product.requiresSellingPlan,
    isGiftCard: product.isGiftCard,
    reviews: toReviewSummary(product.reviewRating, product.reviewCount),
    // Price and stock on the product page are live (the purchase panel),
    // so its badges leave out sale and sold out.
    badges: productBadges(
      {
        available: true,
        publishedAt: product.publishedAt,
        singlePrice: false,
        price: 0,
        compareAt: null,
        subscriptionAvailable:
          !product.requiresSellingPlan &&
          product.sellingPlanGroups.nodes.length > 0,
        merchantLabels: merchantLabels(product),
      },
      now,
    ),
    variantImages: product.variants.nodes.flatMap((variant) =>
      variant.image
        ? [
            {
              options: Object.fromEntries(
                variant.selectedOptions.map(({ name, value }) => [name, value]),
              ),
              url: variant.image.url,
            },
          ]
        : [],
    ),
  };
}

// Images and videos without alt text are described by the product title.
function withAltFallback(media: Media, title: string): Media {
  if (media.kind === "image") {
    return media.image.altText
      ? media
      : { ...media, image: { ...media.image, altText: title } };
  }
  return media.alt ? media : { ...media, alt: title };
}

// Single-variant products carry a placeholder "Title: Default Title" option.
export function isPlaceholderOption(option: {
  optionValues: readonly { name: string }[];
}): boolean {
  return (
    option.optionValues.length === 1 &&
    option.optionValues[0].name === "Default Title"
  );
}

// The variant a card can add straight to the cart: the only one, in stock,
// and needing nothing chosen (no plan, no gift card recipient).
function quickAddVariant(product: ProductCardData): string | null {
  const [only, ...more] = product.variants.nodes;
  return only &&
    more.length === 0 &&
    only.availableForSale &&
    !product.requiresSellingPlan &&
    !product.isGiftCard
    ? only.id
    : null;
}

// The card's compare-at price, only when the product is on sale as a whole:
// every variant (all of them read) has a compare-at above its price. A
// plan-only product's card price is a plan price, which a one-time
// compare-at doesn't describe. single: one compare-at for all.
function saleCompareAt(
  product: ProductCardData,
): { min: Money; single: boolean } | null {
  const { nodes, pageInfo } = product.variants;
  if (product.requiresSellingPlan || pageInfo.hasNextPage) return null;
  const compareAts: Money[] = [];
  for (const variant of nodes) {
    const compareAt = variant.compareAtPrice;
    if (
      !compareAt ||
      Number(compareAt.amount) <= Number(variant.price.amount)
    ) {
      return null;
    }
    compareAts.push(compareAt);
  }
  if (compareAts.length === 0) return null;
  const min = compareAts.reduce((low, next) =>
    Number(next.amount) < Number(low.amount) ? next : low,
  );
  return {
    min,
    single: compareAts.every((c) => Number(c.amount) === Number(min.amount)),
  };
}

export function toProductCard(
  product: ProductCardData,
  { now = Date.now() }: TransformOptions = {},
): ProductCard {
  const { minVariantPrice: oneTimeMin, maxVariantPrice: oneTimeMax } =
    product.priceRange;
  // A subscription-only product can only be bought on a plan: its card
  // shows its plan prices instead, lowest to highest across its variants
  // ("From" when they differ).
  const planPrices = product.variants.nodes.flatMap((variant) =>
    variant.sellingPlanAllocations.nodes.flatMap((allocation) =>
      // The ongoing price (the last adjustment), per delivery.
      allocation.priceAdjustments.slice(-1).map((a) => a.perDeliveryPrice),
    ),
  );
  const min = purchasePrice(
    product.requiresSellingPlan,
    oneTimeMin,
    planPrices,
  );
  const max =
    min === oneTimeMin
      ? oneTimeMax
      : planPrices.reduce((high, next) =>
          Number(next.amount) > Number(high.amount) ? next : high,
        );
  const compareAt = saleCompareAt(product);
  const badges = productBadges(
    {
      available: product.availableForSale,
      publishedAt: product.publishedAt,
      singlePrice:
        oneTimeMin.amount === oneTimeMax.amount && compareAt?.single === true,
      price: Number(oneTimeMin.amount),
      compareAt: compareAt ? Number(compareAt.min.amount) : null,
      subscriptionAvailable:
        !product.requiresSellingPlan &&
        product.variants.nodes.some(
          (variant) => variant.sellingPlanAllocations.nodes.length > 0,
        ),
      merchantLabels: merchantLabels(product),
    },
    now,
  );
  return {
    id: product.id,
    handle: product.handle,
    title: product.title,
    featuredImage: product.featuredImage
      ? {
          ...toImage(product.featuredImage),
          altText: product.featuredImage.altText ?? product.title,
        }
      : null,
    price: {
      min,
      max,
      ...(compareAt ? { compareAtMin: compareAt.min } : {}),
    },
    available: product.availableForSale,
    trackingParameters: product.trackingParameters ?? null,
    reviews: toReviewSummary(product.reviewRating, product.reviewCount),
    isGiftCard: product.isGiftCard,
    quickAddVariantId: quickAddVariant(product),
    badges,
  };
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
}
