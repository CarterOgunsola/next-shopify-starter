import {
  getFilterRemovalUrl,
  getSortByValue,
  isFilterInputActive,
  parseCollectionParams,
  serializeCollectionParams,
} from "@shopify/hydrogen";

// Browse URLs use Shopify's Liquid-compatible params (filter.v.option.color,
// filter.v.price.gte, sort_by, plus after/before cursors), so links built by
// Shopify apps and themes keep working. Hydrogen's helpers do the mapping.

export type ProductFilter = ReturnType<
  typeof parseCollectionParams
>["filters"][number];
export type CollectionSortKey = NonNullable<
  ReturnType<typeof parseCollectionParams>["sortKey"]
>;

export type BrowseParams = {
  filters: ProductFilter[];
  sortKey: CollectionSortKey | undefined;
  reverse: boolean;
  after?: string;
  before?: string;
};

const CURSOR = /^[A-Za-z0-9+/=_-]{1,512}$/;
// Limits on what a URL can ask Shopify for: real filter combinations stay
// well under these.
export const MAX_FILTERS = 20;
export const MAX_FILTER_VALUE = 200;

// The URL's filter params, capped; every other param as is.
function capFilters(params: URLSearchParams): URLSearchParams {
  let filters = 0;
  return new URLSearchParams(
    [...params].filter(([key, value]) => {
      if (!key.startsWith("filter.")) return true;
      if (key.length > MAX_FILTER_VALUE || value.length > MAX_FILTER_VALUE)
        return false;
      return ++filters <= MAX_FILTERS;
    }),
  );
}

export function parseBrowseParams(params: URLSearchParams): BrowseParams {
  const { filters, sortKey, reverse } = parseCollectionParams(
    capFilters(params),
  );
  const after = params.get("after");
  const before = params.get("before");
  return {
    filters,
    sortKey,
    reverse,
    ...(after && CURSOR.test(after) ? { after } : {}),
    ...(!after && before && CURSOR.test(before) ? { before } : {}),
  };
}

export {
  getFilterRemovalUrl,
  getSortByValue,
  isFilterInputActive,
  serializeCollectionParams,
};
