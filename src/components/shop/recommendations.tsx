import { publicContext } from "@/lib/commerce/audience";
import { getProductRecommendations } from "@/lib/commerce/catalog.server";
import { ProductGrid } from "./product-grid";

// A product's recommendations as a section, or nothing when there are
// none. Rendered in its own Suspense boundary by the product page.
export async function Recommendations({
  handle,
  intent,
  title,
  id,
}: {
  handle: string;
  intent: "RELATED" | "COMPLEMENTARY";
  title: string;
  id: string;
}) {
  const products = await getProductRecommendations(
    publicContext(),
    handle,
    intent,
  );
  if (products.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ProductGrid products={products} aboveFold={false} />
    </section>
  );
}
