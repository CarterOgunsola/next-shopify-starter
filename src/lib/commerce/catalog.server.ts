import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { legacyId } from "./shopify/ids";
import {
  fetchProductCard,
  fetchProductCards,
  fetchProductContent,
  fetchProductHandles,
  fetchProductRecommendations,
  type RecommendationIntent,
  type ProductRead,
} from "./shopify/operations/products";
import { parseBrowseParams } from "./shopify/browse-params";
import {
  fetchAllProducts,
  fetchCollectionHandles,
  fetchCollectionListing,
} from "./shopify/operations/listings";
import { ALL_PRODUCTS } from "./collections";
import { analyticsEnv, commerceEnv } from "./config.server";
import {
  fetchShopId,
  fetchShopLocalization,
  fetchShopPolicies,
} from "./shopify/operations/shop";
import {
  fetchSitemapPage,
  fetchSitemapPagesCount,
  type SitemapKind,
} from "./shopify/operations/sitemap";
import { findShopifyRedirect } from "./shopify/redirects.server";
import {
  type CatalogRedirects,
  fetchCatalogRedirects,
  redirectKey,
} from "./shopify/operations/redirects";
import { sameSitePath } from "./discount-code";
import { hasNewBadge } from "./badges";
import { isTemporaryFailure } from "./errors";
import { fetchMenu } from "./shopify/operations/menu";
import { tags } from "./tags";
import type {
  ShopAnalyticsConfig,
  Listing,
  VariantView,
  Collection,
  MenuItem,
  Page,
  ProductCard,
  ProductContent,
  PublicContext,
  ShopPolicy,
  SitemapEntry,
  VariantOffer,
} from "./types";

// Cached reads shared by every visitor, so they take a PublicContext only.
// Reads that end up in a page's static shell use "use cache" (a remote
// cache is always read at request time, so it can't be prerendered). The
// ones requests hit directly (the handle lists the variant and browse
// endpoints check, the sitemaps) use "use cache: remote": on serverless the
// default cache is per instance, so a cold instance would list the whole
// catalog again.
// Each gets "use cache" and its tags from tags.ts. Cached until a Shopify
// webhook expires the tag (webhooks.server.ts).

const SHOP_PAGE_SIZE = 50;

// Products for the /shop landing page, by title.
export async function listProducts(
  _ctx: PublicContext,
  after?: string,
): Promise<Page<ProductCard>> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.productsIndex);
  const page = await fetchProductCards({ first: SHOP_PAGE_SIZE, after });
  if (hasNewBadge(page.items)) cacheLife("days");
  return page;
}

// Is the handle a published product or collection? Checked against the
// cached handle lists before any per-handle read, so made-up handles never
// reach Shopify or leave a cached miss behind. The lists expire with the
// products-index and collections-index tags when Shopify reports a change.
async function isProduct(ctx: PublicContext, handle: string) {
  return (await listProductHandles(ctx)).includes(handle);
}

async function isCollection(ctx: PublicContext, handle: string) {
  return (
    handle === ALL_PRODUCTS.handle ||
    (await listCollectionHandles(ctx)).includes(handle)
  );
}

// The same checks for request-time callers (the variant and browse
// endpoints), from the shared remote cache.
export async function isPublishedProduct(ctx: PublicContext, handle: string) {
  return (await sharedProductHandles(ctx)).includes(handle);
}

export async function isPublishedCollection(
  ctx: PublicContext,
  handle: string,
) {
  return (
    handle === ALL_PRODUCTS.handle ||
    (await sharedCollectionHandles(ctx)).includes(handle)
  );
}

async function sharedProductHandles(_ctx: PublicContext): Promise<string[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(tags.productsIndex);
  return fetchProductHandles();
}

async function sharedCollectionHandles(_ctx: PublicContext): Promise<string[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(tags.collectionsIndex);
  return fetchCollectionHandles();
}

// null when the handle doesn't exist or isn't published to the Headless
// channel.
export async function getProductContent(
  ctx: PublicContext,
  handle: string,
): Promise<ProductContent | null> {
  return (await isProduct(ctx, handle))
    ? ((await cachedProduct(ctx, handle))?.content ?? null)
    : null;
}

// The default (first available) variant with consumer prices, for the
// product page's first paint and structured data. The live, per-buyer view
// replaces it in the browser; the cart and checkout always show Shopify's
// current price.
export async function getDefaultVariantView(
  ctx: PublicContext,
  handle: string,
): Promise<VariantView | null> {
  return (await isProduct(ctx, handle))
    ? ((await cachedProduct(ctx, handle))?.defaultView ?? null)
    : null;
}

// Content, default variant and offers from one Shopify read, cached
// together. All consumer data with no buyer context.
async function cachedProduct(
  _ctx: PublicContext,
  handle: string,
): Promise<ProductRead | null> {
  "use cache";
  cacheTag(tags.product(handle));
  const product = await fetchProductContent(handle);
  const id = product && legacyId(product.content.id);
  if (id) cacheTag(tags.productId(id));
  // Refreshed hourly even without a webhook: stock changes send none (an
  // inventory webhook names only the inventory item), and the page's
  // structured data says whether the product is in stock. Listed but gone
  // (unpublished since): don't keep the miss for long.
  if (product) cacheLife("hours");
  else cacheLife("minutes");
  return product;
}

// "You may also like" for a product page: Shopify's related products,
// published ones only, up to four. Consumer context; cached until the
// product or the catalog changes. Empty if Shopify can't be reached.
const RECOMMENDATIONS = 4;

// intent RELATED ("You may also like") or COMPLEMENTARY ("Pairs well
// with", as set up in Search & Discovery). Cached per product and intent.
// Gift cards aren't recommended.
export async function getProductRecommendations(
  ctx: PublicContext,
  handle: string,
  intent: RecommendationIntent = "RELATED",
): Promise<ProductCard[]> {
  if (!(await isProduct(ctx, handle))) return [];
  return cachedRecommendations(ctx, handle, intent).catch(() => []);
}

async function cachedRecommendations(
  _ctx: PublicContext,
  handle: string,
  intent: RecommendationIntent,
): Promise<ProductCard[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.product(handle), tags.productsIndex);
  const related = (await fetchProductRecommendations(handle, intent))
    .filter((product) => product.handle !== handle && !product.isGiftCard)
    .slice(0, RECOMMENDATIONS);
  if (hasNewBadge(related)) cacheLife("days");
  return related;
}

// Cards for recently viewed products, in the order given: published ones
// only, each cached until it changes. Request-time (the search box asks
// for them), so checked against the shared handle list. Up to 8.
export async function getProductCardsAtRequest(
  ctx: PublicContext,
  handles: string[],
): Promise<ProductCard[]> {
  const listed = await sharedProductHandles(ctx);
  const cards = await Promise.all(
    handles
      .filter((handle) => listed.includes(handle))
      .slice(0, 8)
      // A product that can't be read is left out; Shopify being briefly
      // unavailable fails the request (the endpoint answers 503).
      .map((handle) =>
        cachedCard(ctx, handle).catch((error: unknown) => {
          if (isTemporaryFailure(error)) throw error;
          return null;
        }),
      ),
  );
  return cards.filter((card) => card !== null);
}

async function cachedCard(
  _ctx: PublicContext,
  handle: string,
): Promise<ProductCard | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.product(handle));
  const card = await fetchProductCard(handle);
  if (!card) cacheLife("minutes");
  else if (hasNewBadge([card])) cacheLife("days");
  return card;
}

// The same for request-time callers (the cart's "Pairs well with").
export async function getRecommendationsAtRequest(
  ctx: PublicContext,
  handle: string,
  intent: RecommendationIntent,
): Promise<ProductCard[]> {
  if (!(await isPublishedProduct(ctx, handle))) return [];
  // Temporary failures go to the endpoint (503); others leave the list
  // empty.
  return cachedRecommendations(ctx, handle, intent).catch((error: unknown) => {
    if (isTemporaryFailure(error)) throw error;
    return [];
  });
}

// The same reads for request-time callers (the Markdown routes), checked
// against the shared remote handle lists, so a cold server instance doesn't
// list the whole catalog again.
export async function getProductAtRequest(
  ctx: PublicContext,
  handle: string,
): Promise<{
  content: ProductContent;
  defaultView: VariantView | null;
} | null> {
  if (!(await isPublishedProduct(ctx, handle))) return null;
  const read = await cachedProduct(ctx, handle);
  return read && { content: read.content, defaultView: read.defaultView };
}

export async function getCollectionAtRequest(
  ctx: PublicContext,
  handle: string,
): Promise<{ collection: Collection; listing: Listing } | null> {
  return (await isPublishedCollection(ctx, handle))
    ? cachedCollection(ctx, handle)
    : null;
}

// Every variant's consumer offer, for the product page's structured data.
export async function getVariantOffers(
  ctx: PublicContext,
  handle: string,
): Promise<VariantOffer[] | null> {
  return (await isProduct(ctx, handle))
    ? ((await cachedProduct(ctx, handle))?.offers ?? null)
    : null;
}

// Every published product's handle, for prerendering product pages.
export async function listProductHandles(
  _ctx: PublicContext,
): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.productsIndex);
  return fetchProductHandles();
}

// The default view of a collection (first page, no filters, default sort).
// Filtered, sorted and later pages are uncached (browse.server.ts). "all"
// lists every product when the store has no collection with that handle.
export async function getCollection(
  ctx: PublicContext,
  handle: string,
): Promise<{ collection: Collection; listing: Listing } | null> {
  return (await isCollection(ctx, handle))
    ? cachedCollection(ctx, handle)
    : null;
}

async function cachedCollection(
  _ctx: PublicContext,
  handle: string,
): Promise<{ collection: Collection; listing: Listing } | null> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.collection(handle), tags.productsIndex);
  const defaults = parseBrowseParams(new URLSearchParams());
  const found = await fetchCollectionListing(handle, defaults, undefined);
  if (found) {
    const id = legacyId(found.collection.id);
    if (id) cacheTag(tags.collectionId(id));
    if (hasNewBadge(found.listing.products.items)) cacheLife("days");
    return found;
  }
  if (handle !== ALL_PRODUCTS.handle) {
    cacheLife("minutes");
    return null;
  }
  const listing = await fetchAllProducts(defaults, undefined);
  if (hasNewBadge(listing.products.items)) cacheLife("days");
  return { collection: ALL_PRODUCTS, listing };
}

// Every published collection's handle, for prerendering collection pages.
export async function listCollectionHandles(
  _ctx: PublicContext,
): Promise<string[]> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.collectionsIndex);
  return fetchCollectionHandles();
}

// The store's policies (refund, shipping, subscription, terms, privacy),
// those that are set. Shopify sends no webhook for policy edits, so this
// refreshes hourly (and on shop/update): a policy published in admin shows
// within the hour, and a missing one isn't kept for long.
export async function listShopPolicies(
  _ctx: PublicContext,
): Promise<ShopPolicy[]> {
  "use cache";
  cacheLife("hours");
  cacheTag(tags.shop);
  return fetchShopPolicies();
}

export async function getShopPolicy(
  ctx: PublicContext,
  handle: string,
): Promise<ShopPolicy | null> {
  return (
    (await listShopPolicies(ctx)).find((policy) => policy.handle === handle) ??
    null
  );
}

// The Shopify URL redirect for a missing product or collection page (an old
// handle, set in Online Store > Navigation > URL redirects or when a handle
// changes), for static pages that would otherwise 404. Matched against one
// cached list of the store's product and collection redirects, so a
// made-up handle never reaches Shopify and leaves no cached entry behind.
// Refreshed hourly, since Shopify sends no webhook for redirect edits.
export async function getShopifyRedirect(
  ctx: PublicContext,
  path: string,
): Promise<string | null> {
  const { redirects, complete } = await listCatalogRedirects(ctx);
  const target = redirects[redirectKey(path)];
  if (target) return sameSitePath(target);
  // Only a store with more redirects than the list holds asks per path.
  return complete ? null : lookupShopifyRedirect(ctx, path);
}

async function listCatalogRedirects(
  _ctx: PublicContext,
): Promise<CatalogRedirects> {
  "use cache";
  cacheLife("hours");
  return fetchCatalogRedirects();
}

async function lookupShopifyRedirect(
  _ctx: PublicContext,
  path: string,
): Promise<string | null> {
  "use cache";
  const target = await findShopifyRedirect(
    `https://site.invalid${path}`,
    undefined,
  );
  // A miss is kept briefly, so junk paths don't pile up for hours.
  if (target) cacheLife("hours");
  else cacheLife("minutes");
  return target;
}

// Shop identity for Shopify's browser analytics.
export async function getShopAnalyticsConfig(
  _ctx: PublicContext,
): Promise<ShopAnalyticsConfig> {
  "use cache";
  cacheLife("max");
  cacheTag(tags.shop);
  // Thrown, not cached: an empty id would turn Shopify analytics off until
  // the cache expired.
  const shopId = legacyId(await fetchShopId());
  if (!shopId) {
    console.warn("[shop-analytics] Shopify returned no shop id");
    throw new Error("Shopify returned no shop id");
  }
  return {
    shopId,
    storefrontId: analyticsEnv().storefrontId,
    myshopifyDomain: commerceEnv().storeDomain,
    i18n: await fetchShopLocalization(),
  };
}

// For the root layout: Shopify's analytics config, or null when Shopify
// can't be reached, so an outage never fails every page.
export async function loadShopAnalyticsConfig(
  ctx: PublicContext,
): Promise<ShopAnalyticsConfig | null> {
  try {
    return await getShopAnalyticsConfig(ctx);
  } catch (error) {
    console.warn(
      `[shop-analytics] Shopify scripts skipped: ${error instanceof Error ? error.name : typeof error}`,
    );
    return null;
  }
}

// The shop's sitemap: how many pages of products and of collections
// Shopify's sitemap API has, then each page as site paths. Cached until a
// product or collection changes. Only served after launch (SHOP_INDEXED).
export async function getSitemapPageCount(
  _ctx: PublicContext,
  kind: SitemapKind,
): Promise<number> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(kind === "PRODUCT" ? tags.productsIndex : tags.collectionsIndex);
  return fetchSitemapPagesCount(kind);
}

export async function getSitemapEntries(
  _ctx: PublicContext,
  kind: SitemapKind,
  page: number,
): Promise<SitemapEntry[]> {
  "use cache: remote";
  cacheLife("max");
  cacheTag(kind === "PRODUCT" ? tags.productsIndex : tags.collectionsIndex);
  const base = kind === "PRODUCT" ? "/products/" : "/collections/";
  return (await fetchSitemapPage(kind, page)).map((item) => ({
    path: `${base}${encodeURIComponent(item.handle)}`,
    lastModified: item.updatedAt,
  }));
}

// A Shopify Navigation menu, or null when it's missing, empty or Shopify
// can't be reached (the caller falls back to its own links). Shopify sends
// no webhook when a menu changes: menus are refreshed hourly, or at once
// through POST /api/revalidate/menus.
export async function getMenu(
  _ctx: PublicContext,
  handle: string,
): Promise<MenuItem[] | null> {
  "use cache";
  cacheTag(tags.menus, tags.menu(handle));
  try {
    const menu = await fetchMenu(handle);
    cacheLife("hours");
    return menu;
  } catch (error) {
    console.warn(
      `[menu] ${handle} unavailable: ${error instanceof Error ? error.name : typeof error}`,
    );
    cacheLife("minutes");
    return null;
  }
}
