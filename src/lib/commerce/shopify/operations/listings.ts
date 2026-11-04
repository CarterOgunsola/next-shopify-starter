import "server-only";
import { gql, type StorefrontApi } from "@shopify/hydrogen";
import type {
  Collection,
  Facet,
  Listing,
  PredictiveResults,
} from "../../types";
import type { BrowseParams, CollectionSortKey } from "../browse-params";
import { storefrontRequest } from "../client.server";
import {
  CollectionFragment,
  FilterFragment,
  PageInfoFragment,
} from "../fragments/listing";
import { ProductCardFragment } from "../fragments/product";
import { sanitizeRichText } from "../transforms/html";
import { toImage } from "../transforms/media";
import { toProductCard } from "../transforms/product";

export const PAGE_SIZE = 24;

// Hydrogen's parsed filters have the Storefront input shape, but type
// metafield values as optional where the input type requires them.
type FilterInput = NonNullable<
  StorefrontApi.VariablesOf<typeof CollectionListingQuery>["filters"]
>;
const asFilterInput = (filters: BrowseParams["filters"]) =>
  filters as unknown as FilterInput;

// first/after for forward pages, last/before for going back.
function window(params: BrowseParams) {
  return params.before
    ? { last: PAGE_SIZE, before: params.before }
    : { first: PAGE_SIZE, after: params.after };
}

export const CollectionListingQuery = gql(
  `
    query CollectionListing(
      $handle: String!
      $first: Int
      $after: String
      $last: Int
      $before: String
      $filters: [ProductFilter!]
      $sortKey: ProductCollectionSortKeys
      $reverse: Boolean
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      collection(handle: $handle) {
        ...Collection
        products(
          first: $first
          after: $after
          last: $last
          before: $before
          filters: $filters
          sortKey: $sortKey
          reverse: $reverse
        ) {
          nodes {
            ...ProductCard
          }
          pageInfo {
            ...PageInfo
          }
          filters {
            ...Filter
          }
        }
      }
    }
  `,
  [CollectionFragment, ProductCardFragment, PageInfoFragment, FilterFragment],
);

export const AllProductsQuery = gql(
  `
    query AllProducts(
      $first: Int
      $after: String
      $last: Int
      $before: String
      $sortKey: ProductSortKeys
      $reverse: Boolean
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      products(
        first: $first
        after: $after
        last: $last
        before: $before
        sortKey: $sortKey
        reverse: $reverse
      ) {
        nodes {
          ...ProductCard
        }
        pageInfo {
          ...PageInfo
        }
      }
    }
  `,
  [ProductCardFragment, PageInfoFragment],
);

// prefix: LAST matches the last word as a prefix, so a partial word
// finds something ("jack" finds Jacket), as it does in predictive search.
export const SearchQuery = gql(
  `
    query Search(
      $query: String!
      $first: Int
      $after: String
      $last: Int
      $before: String
      $productFilters: [ProductFilter!]
      $sortKey: SearchSortKeys
      $reverse: Boolean
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      search(
        query: $query
        types: [PRODUCT]
        prefix: LAST
        unavailableProducts: LAST
        first: $first
        after: $after
        last: $last
        before: $before
        productFilters: $productFilters
        sortKey: $sortKey
        reverse: $reverse
      ) {
        totalCount
        nodes {
          ... on Product {
            ...ProductCard
          }
        }
        pageInfo {
          ...PageInfo
        }
        productFilters {
          ...Filter
        }
      }
    }
  `,
  [ProductCardFragment, PageInfoFragment, FilterFragment],
);

export const PredictiveSearchQuery = gql(
  `
    query PredictiveSearch(
      $query: String!
      $limit: Int!
      $country: CountryCode
      $language: LanguageCode
    ) @inContext(country: $country, language: $language) {
      predictiveSearch(
        query: $query
        limit: $limit
        types: [PRODUCT, COLLECTION, QUERY]
        unavailableProducts: LAST
      ) {
        products {
          ...ProductCard
        }
        collections {
          handle
          title
          trackingParameters
        }
        queries {
          text
          trackingParameters
        }
      }
    }
  `,
  [ProductCardFragment],
);

export const CollectionHandlesQuery = gql(`
  query CollectionHandles($after: String) {
    collections(first: 250, after: $after) {
      nodes {
        handle
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`);

type CollectionData = NonNullable<
  StorefrontApi.ResultOf<typeof CollectionListingQuery>["collection"]
>;
type FilterData = CollectionData["products"]["filters"][number];
type PageInfoData = CollectionData["products"]["pageInfo"];
type CardData = Parameters<typeof toProductCard>[0];

function toFacet(filter: FilterData): Facet {
  return {
    id: filter.id,
    label: filter.label,
    type:
      filter.type === "PRICE_RANGE"
        ? "price"
        : filter.type === "BOOLEAN"
          ? "boolean"
          : "list",
    values: filter.values.map(({ id, label, count, input }) => ({
      id,
      label,
      count,
      input: String(input),
    })),
  };
}

function toPage(nodes: readonly CardData[], pageInfo: PageInfoData) {
  return {
    items: nodes.map((product) => toProductCard(product)),
    nextCursor: pageInfo.hasNextPage ? (pageInfo.endCursor ?? null) : null,
    previousCursor: pageInfo.hasPreviousPage
      ? (pageInfo.startCursor ?? null)
      : null,
  };
}

function toCollection(collection: CollectionData): Collection {
  return {
    id: collection.id,
    handle: collection.handle,
    title: collection.title,
    descriptionHtml: sanitizeRichText(collection.descriptionHtml),
    image: collection.image ? toImage(collection.image) : null,
    seo: {
      title: collection.seo.title || collection.title,
      description: collection.seo.description || collection.description,
    },
  };
}

// null when the collection doesn't exist or isn't published to Headless.
export async function fetchCollectionListing(
  handle: string,
  params: BrowseParams,
  buyerIp: string | undefined,
): Promise<{ collection: Collection; listing: Listing } | null> {
  const { collection } = await storefrontRequest(CollectionListingQuery, {
    variables: {
      handle,
      ...window(params),
      filters: asFilterInput(params.filters),
      sortKey: params.sortKey,
      reverse: params.reverse,
    },
    buyerIp,
  });
  if (!collection) return null;
  return {
    collection: toCollection(collection),
    listing: {
      products: toPage(collection.products.nodes, collection.products.pageInfo),
      facets: collection.products.filters.map(toFacet),
    },
  };
}

// Shopify's root product list has no filters and its own sort keys.
const PRODUCT_SORT: Partial<
  Record<
    CollectionSortKey,
    "BEST_SELLING" | "CREATED_AT" | "PRICE" | "TITLE" | "RELEVANCE"
  >
> = {
  BEST_SELLING: "BEST_SELLING",
  CREATED: "CREATED_AT",
  PRICE: "PRICE",
  TITLE: "TITLE",
};

// Every published product, for /collections/all when the store has no
// collection with that handle.
export async function fetchAllProducts(
  params: BrowseParams,
  buyerIp: string | undefined,
): Promise<Listing> {
  const sortKey = params.sortKey ? PRODUCT_SORT[params.sortKey] : undefined;
  const { products } = await storefrontRequest(AllProductsQuery, {
    variables: {
      ...window(params),
      sortKey: sortKey ?? "TITLE",
      reverse: sortKey ? params.reverse : false,
    },
    buyerIp,
  });
  return { products: toPage(products.nodes, products.pageInfo), facets: [] };
}

export async function fetchSearch(
  query: string,
  params: BrowseParams,
  buyerIp: string | undefined,
): Promise<Listing> {
  const { search } = await storefrontRequest(SearchQuery, {
    variables: {
      query,
      ...window(params),
      productFilters: asFilterInput(params.filters),
      // Search sorts by relevance or price only.
      sortKey: params.sortKey === "PRICE" ? "PRICE" : "RELEVANCE",
      reverse: params.sortKey === "PRICE" ? params.reverse : false,
    },
    buyerIp,
  });
  const nodes = search.nodes.filter(
    (node): node is typeof node & CardData => "handle" in node,
  );
  return {
    products: toPage(nodes, search.pageInfo),
    facets: search.productFilters.map(toFacet),
    totalCount: search.totalCount,
  };
}

export async function fetchPredictive(
  query: string,
  limit: number,
  buyerIp: string | undefined,
): Promise<PredictiveResults> {
  const { predictiveSearch } = await storefrontRequest(PredictiveSearchQuery, {
    variables: { query, limit },
    buyerIp,
  });
  return {
    products:
      predictiveSearch?.products.map((product) => toProductCard(product)) ?? [],
    collections:
      predictiveSearch?.collections.map(
        ({ handle, title, trackingParameters }) => ({
          handle,
          title,
          trackingParameters: trackingParameters ?? null,
        }),
      ) ?? [],
    queries:
      predictiveSearch?.queries.map(({ text, trackingParameters }) => ({
        text,
        trackingParameters: trackingParameters ?? null,
      })) ?? [],
  };
}

export async function fetchCollectionHandles(): Promise<string[]> {
  const handles: string[] = [];
  let after: string | undefined;
  do {
    const { collections } = await storefrontRequest(CollectionHandlesQuery, {
      variables: { after },
    });
    handles.push(...collections.nodes.map((c) => c.handle));
    after = collections.pageInfo.hasNextPage
      ? (collections.pageInfo.endCursor ?? undefined)
      : undefined;
  } while (after);
  return handles;
}
