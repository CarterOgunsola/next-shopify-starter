import "server-only";
import { getBuyerIp } from "./buyer.server";
import { parseBrowseParams } from "./shopify/browse-params";
import {
  fetchAllProducts,
  fetchCollectionListing,
  fetchPredictive,
  fetchSearch,
} from "./shopify/operations/listings";
import type { BuyerContext, Listing, PredictiveResults } from "./types";

// Filtered, sorted and paginated listings and search results. Uncached: the
// combinations are endless and results can be buyer-specific. The buyer
// goes into @inContext once B2B pricing exists.

export type BrowseSource = { collection: string } | { query: string };

// search is the page's query string (Shopify's filter.*, sort_by, after,
// before). null when the collection doesn't exist.
export async function browse(
  source: BrowseSource,
  search: string,
  _buyer: BuyerContext,
): Promise<Listing | null> {
  const params = parseBrowseParams(new URLSearchParams(search));
  const buyerIp = await getBuyerIp();
  if ("query" in source) {
    const found = await fetchSearch(source.query, params, buyerIp);
    const unfiltered =
      !params.filters.length && !params.after && !params.before;
    // Close matches are extra: if they fail, the empty result stands.
    return found.totalCount === 0 && unfiltered
      ? ((await closeMatches(source.query, buyerIp).catch(() => null)) ?? found)
      : found;
  }
  const found = await fetchCollectionListing(
    source.collection,
    params,
    buyerIp,
  );
  if (found) return found.listing;
  return source.collection === "all" ? fetchAllProducts(params, buyerIp) : null;
}

// Shopify's full search matches whole words (the last also as a prefix),
// so a typo like "jaket" finds nothing; its predictive search forgives
// typos. So a search that finds nothing shows what predictive search makes
// of the term, up to its limit of 10, marked as close matches: they aren't
// results for the term, so they don't count as any.
const CLOSE_MATCHES = 10;

async function closeMatches(
  query: string,
  buyerIp: string | undefined,
): Promise<Listing | null> {
  const { products } = await fetchPredictive(query, CLOSE_MATCHES, buyerIp);
  if (!products.length) return null;
  return {
    products: { items: products, nextCursor: null, previousCursor: null },
    facets: [],
    totalCount: 0,
    closeMatches: true,
  };
}

export const PREDICTIVE_LIMIT = 6;

export async function predictiveSearch(
  query: string,
  _buyer: BuyerContext,
): Promise<PredictiveResults> {
  return fetchPredictive(query, PREDICTIVE_LIMIT, await getBuyerIp());
}
