import "server-only";
import { gql } from "@shopify/hydrogen";
import { storefrontRequest } from "../client.server";

export const UrlRedirectsQuery = gql(`
  query UrlRedirects($after: String) {
    urlRedirects(first: 250, after: $after) {
      nodes {
        path
        target
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

// Up to 5,000 redirects are read; past that the list is incomplete and
// missing pages fall back to a lookup per path.
const MAX_PAGES = 20;

export type CatalogRedirects = {
  // Source path (lowercased, no trailing slash, as Shopify matches it) to
  // target, for product and collection URLs only.
  redirects: Record<string, string>;
  complete: boolean;
};

export const redirectKey = (path: string) =>
  path.toLowerCase().replace(/\/+$/, "");

const CATALOG_PATH = /^\/(products|collections)\/[^/]+$/;

export async function fetchCatalogRedirects(): Promise<CatalogRedirects> {
  const redirects: Record<string, string> = {};
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { urlRedirects } = await storefrontRequest(UrlRedirectsQuery, {
      variables: { after },
    });
    for (const { path, target } of urlRedirects.nodes) {
      const key = redirectKey(path);
      if (CATALOG_PATH.test(key)) redirects[key] = target;
    }
    if (!urlRedirects.pageInfo.hasNextPage) {
      return { redirects, complete: true };
    }
    after = urlRedirects.pageInfo.endCursor ?? undefined;
  }
  return { redirects, complete: false };
}
