import type { Metadata } from "next";
import { Suspense } from "react";
import {
  ListingBrowser,
  ListingFallback,
} from "@/components/shop/listing-browser";
import { publicContext } from "@/lib/commerce/audience";
import { COLLECTION_SORTS } from "@/lib/commerce/browse-url";
import {
  getCollection,
  listCollectionHandles,
} from "@/lib/commerce/catalog.server";
import { isValidHandle } from "@/lib/commerce/handles";
import { redirectOrNotFound } from "@/lib/commerce/missing-page.server";
import { isShopEnabled, requireShop } from "@/lib/flags";

// Static per handle like product pages, so an unknown or unpublished
// collection is a real 404. The default view is prerendered; filters, sort
// and later pages load in the browser from /api/commerce/browse.
export const ensureStatic = "navigation";
export const instant = false;

const PLACEHOLDER = [{ handle: "none" }];

export async function generateStaticParams() {
  if (!isShopEnabled()) return PLACEHOLDER;
  const handles = await listCollectionHandles(publicContext());
  return [...new Set([...handles, "all"])].map((handle) => ({ handle }));
}

async function load(handle: string) {
  if (!isShopEnabled() || !isValidHandle(handle)) return null;
  return getCollection(publicContext(), handle);
}

export async function generateMetadata({
  params,
}: PageProps<"/collections/[handle]">): Promise<Metadata> {
  const found = await load((await params).handle);
  if (!found) return {};
  return {
    title: found.collection.seo.title,
    description: found.collection.seo.description || undefined,
    alternates: { canonical: `/collections/${found.collection.handle}` },
  };
}

export default async function CollectionPage({
  params,
}: PageProps<"/collections/[handle]">) {
  requireShop();
  const { handle } = await params;
  const found = await load(handle);
  if (!found) return redirectOrNotFound(`/collections/${handle}`);
  const { collection, listing } = found;

  return (
    <>
      <h1>{collection.title}</h1>
      {collection.descriptionHtml && (
        // Sanitized in the commerce layer (sanitizeRichText).
        <div dangerouslySetInnerHTML={{ __html: collection.descriptionHtml }} />
      )}
      {/* The fallback is the same listing (default view), so the live one
          takes over without moving anything. */}
      <Suspense
        fallback={
          <ListingFallback
            initial={listing}
            pathname={`/collections/${collection.handle}`}
            sorts={COLLECTION_SORTS}
          />
        }
      >
        <ListingBrowser
          source={{ collection: collection.handle }}
          initial={listing}
          sorts={COLLECTION_SORTS}
          list={{
            id: collection.id,
            handle: collection.handle,
            title: collection.title,
          }}
        />
      </Suspense>
    </>
  );
}
