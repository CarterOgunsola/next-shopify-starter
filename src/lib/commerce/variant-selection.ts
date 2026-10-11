import { formatMoney } from "./money";
import type {
  Media,
  OptionState,
  ProductContent,
  ProductOption,
  VariantState,
  VariantView,
} from "./types";

// Variant selection lives in the URL: ?flavor=lemon&size=30-servings. Names
// and values match case-insensitively, with spaces and punctuation as
// hyphens. Where two values share a slug ("XL" and "XL+") or a value has
// none (all non-Latin), the URL carries the value as written. Shopify's own
// links (feeds, emails) use ?variant=<numeric id>; that's read once and
// replaced by option params. Other params (utm_*, referral codes) are kept
// as they are.

export type Selection = Record<string, string>;

export function slug(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// The item a URL token names: an exact (case-insensitive) match first, then
// a slug match only when exactly one item has that slug.
function matchToken<T extends { name: string }>(
  items: readonly T[],
  token: string,
): T | undefined {
  const exact = items.find((item) => same(item.name, token));
  if (exact) return exact;
  const key = slug(token);
  if (!key) return undefined;
  const bySlug = items.filter((item) => slug(item.name) === key);
  return bySlug.length === 1 ? bySlug[0] : undefined;
}

// How an item is written in the URL: its slug when that's unique and not
// empty, otherwise its own name.
function urlToken(items: readonly { name: string }[], name: string): string {
  const key = slug(name);
  const unique =
    key !== "" && items.filter((item) => slug(item.name) === key).length === 1;
  return unique ? key : name;
}

function findOption(options: ProductOption[], name: string) {
  return matchToken(options, name);
}

// Option name -> value, with the product's own spelling. Unknown names and
// values are dropped.
export function parseSelection(
  params: URLSearchParams,
  options: ProductOption[],
): Selection {
  const selection: Selection = {};
  for (const [name, raw] of params) {
    const option = findOption(options, name);
    const value = option && matchToken(option.values, raw);
    if (option && value) selection[option.name] = value.name;
  }
  return selection;
}

const VARIANT_PARAM = "variant";

// The numeric id from ?variant=, if it's well formed.
export function parseVariantId(params: URLSearchParams): string | null {
  const value = params.get(VARIANT_PARAM);
  return value && /^\d{1,20}$/.test(value) ? value : null;
}

export function hasOptionParams(
  params: URLSearchParams,
  options: ProductOption[],
): boolean {
  return [...params.keys()].some(
    (name) => name === VARIANT_PARAM || findOption(options, name),
  );
}

// The query string for a selection, in the product's option order, keeping
// non-option params.
export function selectionSearch(
  params: URLSearchParams,
  options: ProductOption[],
  selection: Selection,
): string {
  const next = new URLSearchParams();
  for (const [name, value] of params) {
    if (name !== VARIANT_PARAM && !findOption(options, name)) {
      next.append(name, value);
    }
  }
  for (const option of options) {
    const value = selection[option.name];
    if (value)
      next.set(urlToken(options, option.name), urlToken(option.values, value));
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

// Stable key for comparing selections.
export function selectionKey(selection: Selection): string {
  return JSON.stringify(Object.entries(selection).sort());
}

// The selection a resolved variant stands for, limited to real options.
export function variantSelection(
  variant: Pick<VariantState, "selectedOptions">,
  options: ProductOption[],
): Selection {
  const names = new Set(options.map((option) => option.name));
  return Object.fromEntries(
    variant.selectedOptions
      .filter(({ name }) => names.has(name))
      .map(({ name, value }) => [name, value]),
  );
}

// Option states before live data arrives: selection known, stock unknown.
export function staticOptionStates(
  options: ProductOption[],
  selection: Selection,
): OptionState[] {
  return options.map((option) => ({
    name: option.name,
    values: option.values.map((value) => ({
      name: value.name,
      selected: selection[option.name] === value.name,
      exists: true,
      available: true,
    })),
  }));
}

// Marks the selection from the URL on live option states, so a click shows
// at once while the new variant loads. Options the selection doesn't name
// keep what Shopify resolved.
export function withSelection(
  options: OptionState[],
  selection: Selection,
): OptionState[] {
  return options.map((option) =>
    option.name in selection
      ? {
          ...option,
          values: option.values.map((value) => ({
            ...value,
            selected: selection[option.name] === value.name,
          })),
        }
      : option,
  );
}

export type ViewStatus = "loading" | "ready" | "error";

// Does the variant have every value in the selection?
export function matchesSelection(
  variant: Pick<VariantState, "selectedOptions">,
  selection: Selection,
): boolean {
  return Object.entries(selection).every(([name, value]) =>
    variant.selectedOptions.some((o) => o.name === name && o.value === value),
  );
}

// Why the add button is disabled, or null when it can be used.
export function addDisabledReason(
  status: ViewStatus,
  view: VariantView | null,
  selection: Selection,
): string | null {
  if (status === "error") return "Price and stock couldn't load.";
  if (status === "loading" || !view) return "Checking price and stock.";
  if (!view.variant) return "This product isn't available.";
  if (!matchesSelection(view.variant, selection)) {
    return "This combination isn't available.";
  }
  if (view.variant.available === false) return "Sold out.";
  return null;
}

// The image for the selected values: the first variant with an image that
// has all of them. None when nothing is selected.
export function variantImageFor(
  selection: Selection,
  variantImages: ProductContent["variantImages"],
): string | null {
  const entries = Object.entries(selection);
  if (entries.length === 0) return null;
  return (
    variantImages.find((image) =>
      entries.every(([name, value]) => image.options[name] === value),
    )?.url ?? null
  );
}

// Moves the image with this URL to the front. Shopify adds ?v= and size
// params, so URLs match on their path.
export function leadWith(media: Media[], url: string | null): Media[] {
  if (!url) return media;
  const path = new URL(url).pathname;
  const index = media.findIndex(
    (item) =>
      item.kind === "image" && new URL(item.image.url).pathname === path,
  );
  if (index <= 0) return media;
  return [media[index], ...media.slice(0, index), ...media.slice(index + 1)];
}

// Screen-reader summary after a variant loads. Products without real options
// skip the variant title (Shopify calls it "Default Title").
export function variantAnnouncement(
  variant: VariantState,
  hasOptions: boolean,
): string {
  const stock =
    variant.available === undefined
      ? ""
      : variant.available
        ? ", in stock"
        : ", sold out";
  const summary = `${formatMoney(variant.price)}${stock}.`;
  return hasOptions ? `${variant.title}: ${summary}` : summary;
}

// A cached view for first paint (the product page before the live answer,
// quick add): its price, but no stock claims, which only the live answer
// makes (the page itself is cached for longer than stock stays true).
export function firstPaintView(view: VariantView | null): VariantView | null {
  if (!view?.variant) return view;
  const {
    available: _available,
    lowStock: _lowStock,
    ...variant
  } = view.variant;
  return { ...view, variant };
}
