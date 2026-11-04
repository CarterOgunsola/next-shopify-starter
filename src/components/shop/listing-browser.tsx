"use client";

import { type RefObject, useRef, useState } from "react";
import type { Listing } from "@/lib/commerce";
import { listViewed, searched, useOnce } from "@/lib/commerce/analytics.client";
import { clearFilters, type SortOption } from "@/lib/commerce/browse-url";
import { useBrowse, type BrowseSource } from "@/lib/commerce/use-browse";
import { ActiveFilters } from "./active-filters";
import { ListingControls } from "./listing-controls";
import { ListingPagination } from "./listing-pagination";
import { ProductGrid } from "./product-grid";

// A collection or search listing: controls, results and pages, driven by
// the URL. Shows the previous results (marked busy) while new ones load.
export function ListingBrowser({
  source,
  initial,
  initialQuery,
  sorts,
  hidden,
  list,
}: {
  // The collection being listed, for the list-viewed event.
  list?: { id: string; handle: string; title: string };
  source: BrowseSource | null;
  initial: Listing | null;
  // The browse params initial was rendered for (default: none).
  initialQuery?: string;
  sorts: SortOption[];
  hidden?: Record<string, string>;
}) {
  const { listing, status, params, pathname, navigate, retry } = useBrowse(
    source,
    initial,
    initialQuery,
  );
  const results = useRef<HTMLHeadingElement>(null);

  // After the visitor changes page, removes a filter or retries, focus goes
  // to the results: the control they used is gone or far away. Never on
  // load, reload or back, and not for the filter form's own controls,
  // which stay where they are.
  const focusResults = () => results.current?.focus();
  const go = (next: URLSearchParams) => {
    navigate(next);
    focusResults();
  };

  const ready = status === "ready" && listing !== null;
  useOnce(ready && list ? list.handle : null, () => {
    if (list && listing) listViewed(list, listing.products.items);
  });
  const term = source && "query" in source ? source.query : null;
  useOnce(ready && term ? term : null, () => {
    if (term && listing)
      searched(listing.totalCount ?? listing.products.items.length);
  });

  const products = listing?.products.items ?? [];
  // The shop's currency, from the prices listed (kept when a page has no
  // results), for the price filter's labels.
  const listed = products[0]?.price.min.currencyCode;
  const [currency, setCurrency] = useState(
    listed ?? initial?.products.items[0]?.price.min.currencyCode ?? null,
  );
  if (listed && listed !== currency) setCurrency(listed);

  return (
    <ListingView
      listing={listing}
      status={status}
      params={params}
      pathname={pathname}
      sorts={sorts}
      hidden={hidden}
      currency={currency}
      count={listing ? countLine(listing, term) : ""}
      results={results}
      navigate={navigate}
      go={go}
      retry={() => {
        retry();
        focusResults();
      }}
    />
  );
}

// The listing as first served, before the browser reads the URL (the
// page's Suspense fallback): the same controls and results for the
// default view, so nothing moves when the live listing takes over.
export function ListingFallback({
  initial,
  pathname,
  sorts,
  hidden,
}: {
  initial: Listing;
  pathname: string;
  sorts: SortOption[];
  hidden?: Record<string, string>;
}) {
  const products = initial.products.items;
  return (
    <ListingView
      listing={initial}
      status="ready"
      params={new URLSearchParams()}
      pathname={pathname}
      sorts={sorts}
      hidden={hidden}
      currency={products[0]?.price.min.currencyCode ?? null}
      count={countLine(initial, null)}
      navigate={() => {}}
      go={() => {}}
      retry={() => {}}
    />
  );
}

// The line above the products. A search's close matches aren't results for
// its term, so they get no count.
function countLine(listing: Listing, term: string | null): string {
  if (listing.closeMatches && term) {
    return `No results for “${term}”. Close matches:`;
  }
  return listing.totalCount !== undefined
    ? `${listing.totalCount} results`
    : `${listing.products.items.length} products on this page`;
}

function ListingView({
  listing,
  status,
  params,
  pathname,
  sorts,
  hidden,
  currency,
  count,
  results,
  navigate,
  go,
  retry,
}: {
  listing: Listing | null;
  status: ReturnType<typeof useBrowse>["status"];
  params: URLSearchParams;
  pathname: string;
  sorts: SortOption[];
  hidden?: Record<string, string>;
  currency: string | null;
  count: string;
  results?: RefObject<HTMLHeadingElement | null>;
  navigate: (next: URLSearchParams) => void;
  go: (next: URLSearchParams) => void;
  retry: () => void;
}) {
  const facets = listing?.facets ?? [];
  const products = listing?.products.items ?? [];

  return (
    <div>
      <ListingControls
        action={pathname}
        facets={facets}
        sorts={sorts}
        params={params}
        hidden={hidden}
        currency={currency}
        onChange={navigate}
      />
      <ActiveFilters
        pathname={pathname}
        facets={facets}
        params={params}
        onChange={go}
      />
      <h2 ref={results} tabIndex={-1}>
        Results
      </h2>
      <p aria-live="polite">
        {status === "loading" ? "Loading products." : listing ? count : ""}
      </p>
      {status === "invalid" && (
        <p role="alert">
          Those filters can&apos;t be applied.{" "}
          <button type="button" onClick={() => go(clearFilters(params))}>
            Clear filters
          </button>
        </p>
      )}
      {status === "error" && (
        <p role="alert">
          Products couldn&apos;t load.{" "}
          <button type="button" onClick={retry}>
            Try again
          </button>
        </p>
      )}
      <div aria-busy={status === "loading"}>
        {listing && products.length === 0 && status !== "loading" ? (
          <p>
            No products match.{" "}
            <button type="button" onClick={() => go(clearFilters(params))}>
              Clear filters
            </button>
          </p>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
      {listing && (
        <ListingPagination
          pathname={pathname}
          page={listing.products}
          params={params}
          onChange={go}
        />
      )}
    </div>
  );
}
