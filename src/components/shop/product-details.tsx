import type { ReactNode } from "react";
import type { ProductContent } from "@/lib/commerce";
import { ProductBadges } from "./product-badges";
import { ProductMedia } from "./product-media";

// gallery replaces the plain media list (the page passes one that follows
// the selected variant). children: the purchase panel.
export function ProductDetails({
  product,
  gallery,
  children,
}: {
  product: ProductContent;
  gallery?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article>
      <h1>{product.title}</h1>
      <ProductBadges badges={product.badges} />
      {gallery ?? <ProductMedia media={product.media} />}
      {children}
      {product.descriptionHtml && (
        <section aria-labelledby="description">
          <h2 id="description">Description</h2>
          {/* Sanitized in the commerce layer (sanitizeRichText). */}
          <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
        </section>
      )}
    </article>
  );
}
