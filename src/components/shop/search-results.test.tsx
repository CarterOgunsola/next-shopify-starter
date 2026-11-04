// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Listing, ProductCard } from "@/lib/commerce";
import { SearchResults } from "./search-results";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/search",
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const card = (handle: string): ProductCard => ({
  id: `gid://shopify/Product/${handle}`,
  handle,
  title: handle,
  featuredImage: null,
  price: {
    min: { amount: "10.0", currencyCode: "USD" },
    max: { amount: "10.0", currencyCode: "USD" },
  },
  available: true,
  trackingParameters: null,
});

const found = (handles: string[], more: Partial<Listing> = {}): Listing => ({
  products: {
    items: handles.map(card),
    nextCursor: null,
    previousCursor: null,
  },
  facets: [],
  totalCount: handles.length,
  ...more,
});

function search(term: string, initial: Listing) {
  nav.search = `q=${term}`;
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<SearchResults initial={initial} initialTerm={term} />);
  return fetch;
}

describe("SearchResults", () => {
  it("counts what the search found", () => {
    const fetch = search("jacket", found(["jacket", "jacket-2"]));
    expect(screen.getByText("2 results")).toBeTruthy();
    expect(screen.queryByText(/Close matches/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says when a search found nothing and shows close matches, not a count", () => {
    search(
      "jaket",
      found(["jacket", "jacket-2"], { totalCount: 0, closeMatches: true }),
    );
    expect(
      screen.getByText("No results for “jaket”. Close matches:"),
    ).toBeTruthy();
    expect(screen.queryByText(/\d+ results/)).toBeNull();
    expect(screen.getByRole("link", { name: "jacket" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "jacket-2" })).toBeTruthy();
  });
});
