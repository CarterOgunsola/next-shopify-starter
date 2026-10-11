import { describe, expect, it } from "vitest";
import {
  browseQuery,
  clearFilters,
  filterField,
  hasBrowseParams,
  isFilterActive,
  sortValue,
  COLLECTION_SORTS,
  toggleFilter,
  withPage,
  withPriceRange,
  withSort,
} from "./browse-url";

const navy = JSON.stringify({
  variantOption: { name: "Color", value: "Navy" },
});
const inStock = JSON.stringify({ available: true });
const p = (query: string) => new URLSearchParams(query);

describe("browse URLs", () => {
  it("uses Shopify's Liquid-compatible params for facet values", () => {
    expect(filterField(navy)).toEqual({
      name: "filter.v.option.Color",
      value: "Navy",
    });
    expect(filterField(inStock)).toEqual({
      name: "filter.v.availability",
      value: "1",
    });
    expect(filterField("not json")).toBeNull();
  });

  it("toggles a filter and returns to the first page", () => {
    const on = toggleFilter(p("q=tee&after=abc&utm_source=x"), navy, true);
    expect(on.get("filter.v.option.Color")).toBe("Navy");
    expect(on.has("after")).toBe(false);
    expect(on.get("q")).toBe("tee");
    expect(isFilterActive(on, navy)).toBe(true);
    const off = toggleFilter(on, navy, false);
    expect(isFilterActive(off, navy)).toBe(false);
    expect(off.get("utm_source")).toBe("x");
  });

  it("returns to the first page when a filter is removed", () => {
    const filtered = toggleFilter(p("q=tee"), navy, true);
    filtered.set("after", "page-2-cursor");
    const off = toggleFilter(filtered, navy, false);
    expect(off.has("after")).toBe(false);
    expect(off.has("before")).toBe(false);
    expect(off.get("q")).toBe("tee");
  });

  it("keys requests on browse params only, in a stable order", () => {
    expect(
      browseQuery(
        p("utm_source=x&sort_by=price-ascending&filter.v.availability=1&q=tee"),
      ),
    ).toBe("filter.v.availability=1&sort_by=price-ascending");
    expect(hasBrowseParams(p("q=tee&utm_source=x"))).toBe(false);
    expect(hasBrowseParams(p("after=abc"))).toBe(true);
  });

  it("sorts, pages and clears", () => {
    expect(sortValue(COLLECTION_SORTS[2])).toBe("price-ascending");
    expect(withSort(p("after=abc"), "price-descending").toString()).toBe(
      "sort_by=price-descending",
    );
    expect(withSort(p("sort_by=x"), "").toString()).toBe("");
    expect(withPage(p("after=a&sort_by=x"), "b", "before").toString()).toBe(
      "sort_by=x&before=b",
    );
    expect(
      clearFilters(
        p(
          "filter.v.availability=1&filter.v.price.gte=5&sort_by=x&q=tee&after=a",
        ),
      ).toString(),
    ).toBe("sort_by=x&q=tee");
  });

  it("only accepts numeric price bounds", () => {
    expect(
      withPriceRange(p("after=a"), { min: "10", max: "abc" }).toString(),
    ).toBe("filter.v.price.gte=10");
    expect(
      withPriceRange(p("filter.v.price.gte=10"), {
        min: "",
        max: "40.5",
      }).toString(),
    ).toBe("filter.v.price.lte=40.5");
  });
});
