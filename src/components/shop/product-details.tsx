import type { ReactNode } from "react";
import type { ProductContent } from "@/lib/commerce";
import { ProductBadges } from "./product-badges";
import { ProductMedia } from "./product-media";
import { dsheaDisclaimer } from "@/lib/commerce/compliance";
import {
  DSHEA_ID,
  DsheaDisclaimer,
  Prop65Notice,
  SupplementFacts,
} from "./supplement-facts";

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
  const dshea = product.supplement
    ? dsheaDisclaimer(product.supplement.structureFunctionClaims)
    : null;
  return (
    <article>
      <h1>{product.title}</h1>
      <ProductBadges badges={product.badges} />
      {gallery ?? <ProductMedia media={product.media} />}
      {/* Before the purchase controls: seen before adding. */}
      <Prop65Notice prop65={product.prop65} />
      {children}
      {(product.descriptionHtml || dshea) && (
        // Claims are in the description: the DSHEA disclaimer follows it
        // directly, and both are marked *.
        <section
          aria-labelledby="description"
          aria-describedby={dshea ? DSHEA_ID : undefined}
        >
          <h2 id="description">
            Description
            {dshea && <span aria-hidden="true">*</span>}
          </h2>
          {/* Sanitized in the commerce layer (sanitizeRichText). */}
          <div dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
          {product.supplement && (
            <DsheaDisclaimer
              claims={product.supplement.structureFunctionClaims}
            />
          )}
        </section>
      )}
      {product.supplement && <SupplementFacts info={product.supplement} />}
    </article>
  );
}
