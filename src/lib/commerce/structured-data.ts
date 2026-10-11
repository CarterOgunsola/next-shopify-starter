import { shareableDescription } from "./compliance";
import { purchasePrice } from "./money";
import { legacyId } from "./shopify/ids";
import type {
  ProductContent,
  VariantOffer,
  VariantState,
  ReviewSummary,
} from "./types";

// schema.org data for the product page: a ProductGroup with one Product
// and Offer per variant (each at its ?variant= URL) when the product has
// options, otherwise a single Product. Consumer prices and stock.

const IN_STOCK = "https://schema.org/InStock";
const OUT_OF_STOCK = "https://schema.org/OutOfStock";

// Option names schema.org has a property for; others still vary, but
// can't be named in variesBy.
const VARIES_BY: Record<string, string> = {
  color: "https://schema.org/color",
  colour: "https://schema.org/color",
  size: "https://schema.org/size",
  material: "https://schema.org/material",
  pattern: "https://schema.org/pattern",
};

const images = (product: ProductContent) =>
  product.media.flatMap((media) =>
    media.kind === "image" ? [media.image.url] : [],
  );

const brand = (product: ProductContent) =>
  product.vendor ? { brand: { "@type": "Brand", name: product.vendor } } : {};

function offer(url: string, price: VariantState["price"], available: boolean) {
  return {
    "@type": "Offer",
    url,
    price: price.amount,
    priceCurrency: price.currencyCode,
    availability: available ? IN_STOCK : OUT_OF_STOCK,
  };
}

// Label facts only (serving size and count), never claims or ingredients'
// effects.
function supplementProperties(supplement: ProductContent["supplement"]) {
  const properties = [
    supplement?.servingSize && {
      "@type": "PropertyValue",
      name: "Serving size",
      value: supplement.servingSize,
    },
    supplement?.servingsPerContainer && {
      "@type": "PropertyValue",
      name: "Servings per container",
      value: supplement.servingsPerContainer,
    },
  ].filter(Boolean);
  return properties.length ? { additionalProperty: properties } : {};
}

// Reviews shown on the page. AggregateRating goes in only with reviews the
// visitor can read there, as search engines require.
export type VisibleReviews = {
  summary: ReviewSummary | null;
  reviews: {
    author: string;
    rating: number;
    title: string | null;
    body: string;
    createdAt: string;
  }[];
};

function reviewProperties(visible: VisibleReviews | null) {
  if (!visible?.summary || visible.reviews.length === 0) return {};
  return {
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: visible.summary.rating,
      reviewCount: visible.summary.count,
      bestRating: 5,
      worstRating: 1,
    },
    review: visible.reviews.map((review) => ({
      "@type": "Review",
      author: { "@type": "Person", name: review.author },
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
        bestRating: 5,
        worstRating: 1,
      },
      ...(review.title ? { name: review.title } : {}),
      reviewBody: review.body,
      ...(review.createdAt
        ? { datePublished: review.createdAt.slice(0, 10) }
        : {}),
    })),
  };
}

export function productJsonLd(
  product: ProductContent,
  url: string,
  variant: VariantState | null,
  offers: VariantOffer[] | null = null,
  visibleReviews: VisibleReviews | null = null,
) {
  const supplement = product.supplement;
  const base = {
    "@context": "https://schema.org",
    name: product.title,
    // A description with structure/function claims needs the DSHEA
    // disclaimer next to it, which structured data can't carry: left out.
    ...(shareableDescription(product)
      ? { description: shareableDescription(product) }
      : {}),
    url,
    image: images(product),
    ...brand(product),
    ...supplementProperties(supplement),
    ...reviewProperties(visibleReviews),
  };
  if (!offers || offers.length < 2 || product.options.length === 0) {
    return {
      ...base,
      "@type": "Product",
      ...(variant?.sku ? { sku: variant.sku } : {}),
      ...(variant
        ? {
            offers: offer(
              url,
              purchasePrice(
                product.requiresSellingPlan,
                variant.price,
                variant.sellingPlanPrices.map((plan) => plan.price),
              ),
              variant.available === true,
            ),
          }
        : {}),
    };
  }
  const variesBy = [
    ...new Set(
      product.options.flatMap((option) => {
        const property = VARIES_BY[option.name.toLowerCase()];
        return property ? [property] : [];
      }),
    ),
  ];
  return {
    ...base,
    "@type": "ProductGroup",
    productGroupID: legacyId(product.id) ?? product.id,
    ...(variesBy.length ? { variesBy } : {}),
    hasVariant: offers.map((variant) => {
      const id = legacyId(variant.id);
      const variantUrl = id ? `${url}?variant=${id}` : url;
      return {
        "@type": "Product",
        name: `${product.title} - ${variant.title}`,
        ...(variant.sku ? { sku: variant.sku } : {}),
        ...(variant.gtin && /^\d{8,14}$/.test(variant.gtin)
          ? { gtin: variant.gtin }
          : {}),
        image: variant.imageUrl ?? images(product)[0],
        ...Object.fromEntries(
          variant.selectedOptions.flatMap(({ name, value }) => {
            const property = VARIES_BY[name.toLowerCase()];
            return property
              ? [[property.replace("https://schema.org/", ""), value]]
              : [];
          }),
        ),
        offers: offer(
          variantUrl,
          purchasePrice(
            product.requiresSellingPlan,
            variant.price,
            variant.planPrices,
          ),
          variant.available === true,
        ),
      };
    }),
  };
}

// Home > Shop > the product.
export function productBreadcrumbsJsonLd(
  product: Pick<ProductContent, "title">,
  site: string,
  url: string,
) {
  const crumbs = [
    { name: "Home", item: new URL("/", site).href },
    { name: "Shop", item: new URL("/shop", site).href },
    { name: product.title, item: url },
  ];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      ...crumb,
    })),
  };
}
