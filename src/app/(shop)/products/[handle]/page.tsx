import type { Metadata } from "next";
import { Suspense } from "react";
import { JsonLd } from "@/components/json-ld";
import { ProductDetails } from "@/components/shop/product-details";
import { ProductGallery } from "@/components/shop/product-gallery";
import { ProductMedia } from "@/components/shop/product-media";
import { ProductOpenGraph } from "@/components/shop/product-open-graph";
import { ProductReviews } from "@/components/shop/product-reviews";
import { Recommendations } from "@/components/shop/recommendations";
import { RecordProductView } from "@/components/shop/record-product-view";
import {
  backInStockEnabled,
  backInStockMarketing,
} from "@/lib/marketing/back-in-stock";
import { reviewsOpen } from "@/lib/reviews/provider.server";
import { loadReviewPage } from "@/lib/reviews/reviews.server";
import { ProductPurchase } from "@/components/shop/product-purchase";
import { PurchaseFallback } from "@/components/shop/purchase-fallback";
import { publicContext } from "@/lib/commerce/audience";
import {
  getDefaultVariantView,
  getVariantOffers,
  getProductContent,
  listProductHandles,
} from "@/lib/commerce/catalog.server";
import { isValidHandle } from "@/lib/commerce/handles";
import { firstPaintView } from "@/lib/commerce/variant-selection";
import { redirectOrNotFound } from "@/lib/commerce/missing-page.server";
import {
  productBreadcrumbsJsonLd,
  productJsonLd,
} from "@/lib/commerce/structured-data";
import { publicEnv } from "@/lib/env";
import { isShopEnabled, requireShop } from "@/lib/flags";

// Fully static per handle, so an unknown or unpublished handle gets a real
// 404 instead of a 200 streamed shell. Navigations block on the server for
// the same reason.
export const ensureStatic = "navigation";
export const instant = false;

// The route needs at least one prerendered entry. With the shop off (or no
// products) this placeholder renders the 404 like any unknown handle.
const PLACEHOLDER = [{ handle: "none" }];

export async function generateStaticParams() {
  if (!isShopEnabled()) return PLACEHOLDER;
  const handles = await listProductHandles(publicContext());
  return handles.length ? handles.map((handle) => ({ handle })) : PLACEHOLDER;
}

async function loadProduct(handle: string) {
  if (!isShopEnabled() || !isValidHandle(handle)) return null;
  return getProductContent(publicContext(), handle);
}

export async function generateMetadata({
  params,
}: PageProps<"/products/[handle]">): Promise<Metadata> {
  const product = await loadProduct((await params).handle);
  if (!product) return {};
  const image = product.media.find((media) => media.kind === "image");
  const images = image
    ? [
        {
          url: image.image.url,
          width: image.image.width ?? undefined,
          height: image.image.height ?? undefined,
          alt: image.image.altText ?? product.title,
        },
      ]
    : undefined;
  return {
    title: product.seo.title,
    description: product.seo.description,
    alternates: { canonical: `/products/${product.handle}` },
    openGraph: {
      title: product.seo.title,
      description: product.seo.description,
      url: `/products/${product.handle}`,
      images,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: product.seo.title,
      description: product.seo.description,
      images: images?.map((i) => i.url),
    },
  };
}

export default async function ProductPage({
  params,
}: PageProps<"/products/[handle]">) {
  requireShop();
  const { handle } = await params;
  const product = await loadProduct(handle);
  if (!product) return redirectOrNotFound(`/products/${handle}`);
  // Recommendations stream in their own Suspense boundaries below.
  const [defaultView, offers, reviewPage] = await Promise.all([
    getDefaultVariantView(publicContext(), handle),
    getVariantOffers(publicContext(), handle),
    loadReviewPage(handle, product.id),
  ]);
  const visibleReviews = {
    summary: product.reviews,
    reviews: reviewPage.reviews,
  };

  const url = new URL(
    `/products/${product.handle}`,
    publicEnv.NEXT_PUBLIC_SITE_URL,
  ).href;

  // The purchase panel claims stock only from the live answer.
  const firstPaint = firstPaintView(defaultView);
  return (
    <>
      <ProductOpenGraph product={product} view={defaultView} />
      <JsonLd
        data={productJsonLd(
          product,
          url,
          defaultView?.variant ?? null,
          offers,
          visibleReviews,
        )}
      />
      <JsonLd
        data={productBreadcrumbsJsonLd(
          product,
          publicEnv.NEXT_PUBLIC_SITE_URL,
          url,
        )}
      />
      {/* The selection is read from the URL in the browser (the page is
          static), so the gallery and purchase panel sit in Suspense with
          server-rendered fallbacks that include the default price. */}
      <ProductDetails
        product={product}
        gallery={
          <Suspense fallback={<ProductMedia media={product.media} />}>
            <ProductGallery product={product} />
          </Suspense>
        }
      >
        <Suspense
          fallback={
            <PurchaseFallback
              options={product.options}
              view={firstPaint}
              sellingPlanGroups={product.sellingPlanGroups}
              requiresSellingPlan={product.requiresSellingPlan}
            />
          }
        >
          <ProductPurchase
            handle={product.handle}
            options={product.options}
            sellingPlanGroups={product.sellingPlanGroups}
            requiresSellingPlan={product.requiresSellingPlan}
            initialView={firstPaint}
            backInStock={backInStockEnabled()}
            marketingOptIn={backInStockMarketing()}
            isGiftCard={product.isGiftCard}
            product={{
              id: product.id,
              handle: product.handle,
              title: product.title,
              vendor: product.vendor,
              productType: product.productType,
              imageUrl:
                product.media.find((media) => media.kind === "image")?.image
                  .url ?? null,
            }}
          />
        </Suspense>
      </ProductDetails>
      <RecordProductView handle={product.handle} />
      <Suspense fallback={null}>
        <Recommendations
          handle={product.handle}
          intent="COMPLEMENTARY"
          title="Pairs well with"
          id="pairs-well-with"
        />
      </Suspense>
      <ProductReviews
        handle={product.handle}
        summary={product.reviews}
        page={reviewPage}
        open={reviewsOpen()}
      />
      <Suspense fallback={null}>
        <Recommendations
          handle={product.handle}
          intent="RELATED"
          title="You may also like"
          id="recommendations"
        />
      </Suspense>
    </>
  );
}
