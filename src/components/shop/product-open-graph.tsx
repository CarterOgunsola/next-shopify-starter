import type { ProductContent, VariantView } from "@/lib/commerce";
import { purchasePrice } from "@/lib/commerce/money";

// Open Graph's product tags, which Next's openGraph metadata doesn't have
// (its other field renders name=, which Open Graph readers ignore). React
// hoists them into the head. The price is what the product can be bought
// at: the plan price for a subscription-only product.
export function ProductOpenGraph({
  product,
  view,
}: {
  product: ProductContent;
  view: VariantView | null;
}) {
  const variant = view?.variant;
  const price =
    variant &&
    purchasePrice(
      product.requiresSellingPlan,
      variant.price,
      variant.sellingPlanPrices.map((plan) => plan.price),
    );
  return (
    <>
      <meta property="og:type" content="product" />
      {price && (
        <>
          <meta property="product:price:amount" content={price.amount} />
          <meta
            property="product:price:currency"
            content={price.currencyCode}
          />
        </>
      )}
    </>
  );
}
