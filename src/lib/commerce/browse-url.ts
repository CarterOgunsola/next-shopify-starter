import {
  getFilterRemovalUrl,
  getSortByValue,
  isFilterInputActive,
  parseBrowseParams,
  serializeCollectionParams,
  type CollectionSortKey,
  type ProductFilter,
} from "./shopify/browse-params";

// Browse state in the URL, in Shopify's Liquid-compatible params:
// filter.v.option.color=Navy, filter.v.price.gte=10, sort_by=price-ascending,
// plus after/before page cursors. Other params (q, utm_*) are kept.

const PRICE_MIN = "filter.v.price.gte";
const PRICE_MAX = "filter.v.price.lte";

const isBrowseKey = (key: string) =>
  key.startsWith("filter.") ||
  key === "sort_by" ||
  key === "after" ||
  key === "before";

// Just the browse params, in a stable order: the request key and what the
// listing endpoint gets.
export function browseQuery(params: URLSearchParams): string {
  const entries = [...params].filter(([key]) => isBrowseKey(key));
  entries.sort(([a, x], [b, y]) => a.localeCompare(b) || x.localeCompare(y));
  return new URLSearchParams(entries).toString();
}

export function hasBrowseParams(params: URLSearchParams): boolean {
  return [...params.keys()].some(isBrowseKey);
}

function withoutCursors(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete("after");
  next.delete("before");
  return next;
}

function parseInput(input: string): ProductFilter | null {
  try {
    return JSON.parse(input) as ProductFilter;
  } catch {
    return null;
  }
}

// The form field (name and value) for one facet value, so the no-JavaScript
// form submits the same URL the script builds.
export function filterField(
  input: string,
): { name: string; value: string } | null {
  const filter = parseInput(input);
  if (!filter) return null;
  const [entry] = serializeCollectionParams({
    filters: [filter],
    sortKey: undefined,
    reverse: false,
  });
  return entry ? { name: entry[0], value: entry[1] } : null;
}

export function isFilterActive(
  params: URLSearchParams,
  input: string,
): boolean {
  return isFilterInputActive(parseBrowseParams(params).filters, input);
}

// Turns one facet value on or off, back on the first page.
export function toggleFilter(
  params: URLSearchParams,
  input: string,
  on: boolean,
): URLSearchParams {
  const filter = parseInput(input);
  if (!filter) return params;
  if (!on) {
    return withoutCursors(
      new URLSearchParams(getFilterRemovalUrl(params, filter)),
    );
  }
  const next = withoutCursors(params);
  const field = filterField(input);
  if (field) next.append(field.name, field.value);
  return next;
}

export function priceRange(params: URLSearchParams) {
  return { min: params.get(PRICE_MIN) ?? "", max: params.get(PRICE_MAX) ?? "" };
}

export function withPriceRange(
  params: URLSearchParams,
  { min, max }: { min: string; max: string },
): URLSearchParams {
  const next = withoutCursors(params);
  const set = (key: string, value: string) =>
    /^\d+(\.\d{1,2})?$/.test(value.trim())
      ? next.set(key, value.trim())
      : next.delete(key);
  set(PRICE_MIN, min);
  set(PRICE_MAX, max);
  return next;
}

export type SortOption = {
  label: string;
  sortKey: CollectionSortKey;
  reverse: boolean;
};

export const COLLECTION_SORTS: SortOption[] = [
  { label: "Featured", sortKey: "COLLECTION_DEFAULT", reverse: false },
  { label: "Best selling", sortKey: "BEST_SELLING", reverse: false },
  { label: "Price, low to high", sortKey: "PRICE", reverse: false },
  { label: "Price, high to low", sortKey: "PRICE", reverse: true },
  { label: "Newest", sortKey: "CREATED", reverse: true },
  { label: "Name, A to Z", sortKey: "TITLE", reverse: false },
];

export const SEARCH_SORTS: SortOption[] = [
  { label: "Relevance", sortKey: "RELEVANCE", reverse: false },
  { label: "Price, low to high", sortKey: "PRICE", reverse: false },
  { label: "Price, high to low", sortKey: "PRICE", reverse: true },
];

export function sortValue(option: SortOption): string {
  return getSortByValue(option.sortKey, option.reverse);
}

export function withSort(
  params: URLSearchParams,
  value: string,
): URLSearchParams {
  const next = withoutCursors(params);
  if (value) next.set("sort_by", value);
  else next.delete("sort_by");
  return next;
}

export function withPage(
  params: URLSearchParams,
  cursor: string,
  direction: "after" | "before",
): URLSearchParams {
  const next = withoutCursors(params);
  next.set(direction, cursor);
  return next;
}

// Removes every filter and the page cursor; keeps sort, q and others.
export function clearFilters(params: URLSearchParams): URLSearchParams {
  const next = withoutCursors(params);
  for (const key of [...next.keys()]) {
    if (key.startsWith("filter.")) next.delete(key);
  }
  return next;
}

export function toSearch(params: URLSearchParams): string {
  const query = params.toString();
  return query ? `?${query}` : "";
}
