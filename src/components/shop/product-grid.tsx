import { formatMoney, type ProductCard } from "@/lib/commerce";
import { withSearchTracking } from "@/lib/commerce/search-tracking";
import { IntentLink } from "./intent-link";
import { ProductBadges } from "./product-badges";
import { QuickAdd } from "./quick-add";
import { RatingSummary } from "./rating-summary";
import { ShopifyImage } from "./shopify-image";

// aboveFold: the grid leads the page (a listing), so its first row can be
// the largest paint: not lazy, and the first image fetched first. A grid
// further down (recommendations) loads lazily like any other image.
export function ProductGrid({
  products,
  aboveFold = true,
}: {
  products: ProductCard[];
  aboveFold?: boolean;
}) {
  return (
    <ul aria-label="Products">
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductTile
            product={product}
            position={aboveFold ? index : FIRST_ROW}
          />
        </li>
      ))}
    </ul>
  );
}

const FIRST_ROW = 4;

function ProductTile({
  product,
  position,
}: {
  product: ProductCard;
  position: number;
}) {
  const { min, max, compareAtMin } = product.price;
  const range = min.amount !== max.amount;
  return (
    <article>
      {product.featuredImage && (
        <ShopifyImage
          src={product.featuredImage.url}
          alt={product.featuredImage.altText ?? product.title}
          width={product.featuredImage.width ?? 600}
          height={product.featuredImage.height ?? 600}
          sizes="(min-width: 768px) 25vw, 50vw"
          {...(position < FIRST_ROW ? { loading: "eager" as const } : {})}
          {...(position === 0 ? { fetchPriority: "high" as const } : {})}
        />
      )}
      <h3>
        <IntentLink
          href={withSearchTracking(
            `/products/${product.handle}`,
            product.trackingParameters,
          )}
        >
          {product.title}
        </IntentLink>
      </h3>
      <p>
        {compareAtMin && (
          <>
            <s>
              <span className="sr-only">Regular price </span>
              {formatMoney(compareAtMin)}
            </s>{" "}
          </>
        )}
        {range ? `From ${formatMoney(min)}` : formatMoney(min)}
      </p>
      <ProductBadges badges={product.badges} />
      <QuickAdd product={product} />
      {product.reviews && (
        <p>
          <RatingSummary summary={product.reviews} />
        </p>
      )}
    </article>
  );
}
