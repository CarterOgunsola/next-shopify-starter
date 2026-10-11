// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Listing, ProductCard } from "@/lib/commerce";
import { COLLECTION_SORTS } from "@/lib/commerce/browse-url";
import { ListingBrowser } from "./listing-browser";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/collections/test-apparel",
}));

const usd = (amount: string) => ({ amount, currencyCode: "USD" });
const card = (handle: string, available = true): ProductCard => ({
  id: `gid://shopify/Product/${handle}`,
  handle,
  title: handle,
  featuredImage: null,
  price: { min: usd("10.0"), max: usd("10.0") },
  available,
  trackingParameters: null,
});
const inStock = JSON.stringify({ available: true });

function listing(handles: string[], next: string | null = null): Listing {
  return {
    products: {
      items: handles.map((h) => card(h)),
      nextCursor: next,
      previousCursor: null,
    },
    facets: [
      {
        id: "filter.v.availability",
        label: "Availability",
        type: "list",
        values: [{ id: "in", label: "In stock", count: 2, input: inStock }],
      },
    ],
  };
}

let pushState: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  nav.search = "";
  pushState = vi.spyOn(window.history, "pushState");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderBrowser = (initial: Listing | null) =>
  render(
    <ListingBrowser
      source={{ collection: "test-apparel" }}
      initial={initial}
      sorts={COLLECTION_SORTS}
    />,
  );

describe("ListingBrowser", () => {
  it("shows the server's default view without a request", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderBrowser(listing(["tee", "hat"], "cursor-2"));
    expect(screen.getByRole("link", { name: "tee" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Next page" }).getAttribute("href"),
    ).toBe("/collections/test-apparel?after=cursor-2");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("uses the server's view for the filters it was rendered with", () => {
    nav.search = "filter.v.availability=1&utm_source=x";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <ListingBrowser
        source={{ query: "tee" }}
        initial={listing(["tee"])}
        initialQuery="filter.v.availability=1"
        sorts={COLLECTION_SORTS}
      />,
    );
    expect(screen.getByRole("link", { name: "tee" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("loads a filtered view from the browse endpoint", async () => {
    nav.search = "filter.v.availability=1&utm_source=x";
    const fetchSpy = vi.fn(async () => Response.json(listing(["tee"])));
    vi.stubGlobal("fetch", fetchSpy);
    renderBrowser(listing(["tee", "hat"]));

    await screen.findByText("1 products on this page");
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/commerce/browse?collection=test-apparel&filter.v.availability=1",
      expect.anything(),
    );
    expect(
      screen.getByRole("checkbox", { name: "In stock (2)" }),
    ).toHaveProperty("checked", true);
    expect(
      screen.getByRole("link", {
        name: "Remove filter Availability: In stock",
      }),
    ).toBeTruthy();
  });

  it("puts a filter, sort or page into the URL with pushState", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderBrowser(listing(["tee", "hat"], "cursor-2"));

    await userEvent.click(
      screen.getByRole("checkbox", { name: "In stock (2)" }),
    );
    expect(pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/collections/test-apparel?filter.v.availability=1",
    );

    await userEvent.selectOptions(
      screen.getByLabelText("Sort by"),
      "Price, low to high",
    );
    expect(pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/collections/test-apparel?sort_by=price-ascending",
    );

    await userEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/collections/test-apparel?after=cursor-2",
    );
  });

  it("offers a way out of an empty result", async () => {
    nav.search = "filter.v.availability=1";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(listing([]))),
    );
    renderBrowser(null);
    expect(await screen.findByText(/No products match/)).toBeTruthy();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/collections/test-apparel",
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Results" }),
    );
  });

  it("moves focus to the results after visitor actions only", async () => {
    nav.search = "filter.v.availability=1&after=cursor-2";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(listing(["tee"], "cursor-3"))),
    );
    renderBrowser(null);
    await screen.findByRole("link", { name: "tee" });
    const results = screen.getByRole("heading", { name: "Results" });
    // Not on load, even on a later page.
    expect(document.activeElement).not.toBe(results);

    await userEvent.click(
      screen.getByRole("link", {
        name: "Remove filter Availability: In stock",
      }),
    );
    expect(document.activeElement).toBe(results);

    screen.getByRole("checkbox", { name: "In stock (2)" }).focus();
    await userEvent.click(
      screen.getByRole("link", { name: "Clear all filters" }),
    );
    expect(document.activeElement).toBe(results);

    screen.getByRole("checkbox", { name: "In stock (2)" }).focus();
    await userEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(document.activeElement).toBe(results);
  });

  it("offers a retry when loading fails", async () => {
    nav.search = "sort_by=price-ascending";
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json(listing(["tee"])));
    vi.stubGlobal("fetch", fetchSpy);
    renderBrowser(null);
    await userEvent.click(
      await screen.findByRole("button", { name: "Try again" }),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Results" }),
    );
    expect(await screen.findByRole("link", { name: "tee" })).toBeTruthy();
  });

  it("offers clearing the filters, not a retry, when Shopify rejects them", async () => {
    nav.search = "filter.v.option.Color=Navy&sort_by=price-ascending";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 400 })),
    );
    renderBrowser(null);
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "Those filters can't be applied. Clear filters",
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );
    expect(pushState).toHaveBeenCalledWith(
      null,
      "",
      "/collections/test-apparel?sort_by=price-ascending",
    );
  });

  it("applies a sort picked with the arrow keys on Enter or blur", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderBrowser(listing(["tee", "hat"]));
    const sort = screen.getByLabelText("Sort by");
    sort.focus();
    await userEvent.keyboard("{ArrowDown}");
    // Some browsers fire change on each arrow; the store only drafts it.
    fireEvent.change(sort, { target: { value: "best-selling" } });
    expect(pushState).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(pushState).toHaveBeenLastCalledWith(
      null,
      "",
      "/collections/test-apparel?sort_by=best-selling",
    );
  });

  it("works as a plain GET form", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderBrowser(listing(["tee"]));
    const form = screen.getByRole("form", { name: "Filter and sort" });
    expect(form.getAttribute("method")).toBe("get");
    expect(form.getAttribute("action")).toBe("/collections/test-apparel");
    expect(
      screen
        .getByRole("checkbox", { name: "In stock (2)" })
        .getAttribute("name"),
    ).toBe("filter.v.availability");
  });
});
