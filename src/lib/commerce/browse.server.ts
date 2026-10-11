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
  if ("query" in source) return fetchSearch(source.query, params, buyerIp);
  const found = await fetchCollectionListing(
    source.collection,
    params,
    buyerIp,
  );
  if (found) return found.listing;
  return source.collection === "all" ? fetchAllProducts(params, buyerIp) : null;
}

export const PREDICTIVE_LIMIT = 6;

export async function predictiveSearch(
  query: string,
  _buyer: BuyerContext,
): Promise<PredictiveResults> {
  return fetchPredictive(query, PREDICTIVE_LIMIT, await getBuyerIp());
}
