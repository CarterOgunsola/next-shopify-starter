import "server-only";
import { gql } from "@shopify/hydrogen";
import { storefrontRequest } from "../client.server";

// Shopify's sitemap API: a page count and pages of up to 250 handles with
// their last update, per resource type. Pages can be empty without being
// the last one; hasNextPage says when to stop.

export type SitemapKind = "PRODUCT" | "COLLECTION";

export const SitemapPagesQuery = gql(`
  query SitemapPages($type: SitemapType!) {
    sitemap(type: $type) {
      pagesCount {
        count
      }
    }
  }
`);

export const SitemapPageQuery = gql(`
  query SitemapPage($type: SitemapType!, $page: Int!) {
    sitemap(type: $type) {
      resources(page: $page) {
        hasNextPage
        items {
          handle
          updatedAt
        }
      }
    }
  }
`);

export async function fetchSitemapPagesCount(
  type: SitemapKind,
): Promise<number> {
  const { sitemap } = await storefrontRequest(SitemapPagesQuery, {
    variables: { type },
  });
  return sitemap.pagesCount?.count ?? 0;
}

export async function fetchSitemapPage(
  type: SitemapKind,
  page: number,
): Promise<{ handle: string; updatedAt: string }[]> {
  const { sitemap } = await storefrontRequest(SitemapPageQuery, {
    variables: { type, page },
  });
  return (sitemap.resources?.items ?? []).map(({ handle, updatedAt }) => ({
    handle,
    updatedAt: String(updatedAt),
  }));
}
