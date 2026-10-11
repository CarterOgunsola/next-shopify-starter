// @vitest-environment jsdom
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PredictiveResults } from "@/lib/commerce";
import { resetRecentlyViewedWatch } from "@/lib/commerce/recently-viewed";
import { publishConsent, resetConsentSignal } from "@/lib/consent/signal";
import { SearchBox } from "./search-box";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const usd = (amount: string) => ({ amount, currencyCode: "USD" });
const results: PredictiveResults = {
  products: [
    {
      id: "gid://shopify/Product/1",
      handle: "test-tee-3-option",
      title: "Test Tee",
      featuredImage: null,
      price: { min: usd("38.0"), max: usd("38.0") },
      available: true,
      trackingParameters: "_pos=1&_sid=s1&_ss=p",
    },
  ],
  collections: [
    { handle: "test-apparel", title: "Apparel", trackingParameters: null },
  ],
  queries: [{ text: "test tee", trackingParameters: "_sid=s1" }],
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
  resetConsentSignal();
  resetRecentlyViewedWatch();
  window.localStorage.clear();
});

const consent = (preferences: boolean) =>
  publishConsent({
    necessary: true,
    preferences,
    analytics: false,
    marketing: false,
    saleOfData: true,
    gpc: false,
    decided: true,
  });

describe("SearchBox", () => {
  it("suggests queries, products and collections and opens one with the keyboard", async () => {
    const fetchSpy = vi.fn(async () => Response.json(results));
    vi.stubGlobal("fetch", fetchSpy);
    render(<SearchBox />);

    const input = screen.getByRole("combobox", { name: "Search" });
    await userEvent.type(input, "test");
    expect(
      await screen.findByRole("option", { name: "Test Tee, $38.00" }),
    ).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group", { name: "Products" })).toBeTruthy();

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBe(
      screen.getByRole("option", { name: "Test Tee, $38.00" }).id,
    );
    await userEvent.keyboard("{Enter}");
    expect(push).toHaveBeenCalledWith(
      "/products/test-tee-3-option?_pos=1&_sid=s1&_ss=p",
    );
  });

  it("searches for the typed term on Enter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ products: [], collections: [], queries: [] }),
      ),
    );
    render(<SearchBox />);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search" }),
      "electrolytes{Enter}",
    );
    expect(push).toHaveBeenCalledWith("/search?q=electrolytes");
  });

  it("closes on Escape", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(results)),
    );
    render(<SearchBox />);
    const input = screen.getByRole("combobox", { name: "Search" });
    await userEvent.type(input, "test");
    await screen.findByRole("option", { name: "Apparel" });
    await userEvent.keyboard("{Escape}");
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("stops saying Searching when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    render(<SearchBox />);
    await userEvent.type(
      screen.getByRole("combobox", { name: "Search" }),
      "electrolytes",
    );
    await waitFor(() => expect(screen.queryByText("Searching.")).toBeNull());
  });

  it("doesn't search for a single character", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SearchBox />);
    await userEvent.type(screen.getByRole("combobox", { name: "Search" }), "s");
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("suggests recently viewed products, as current cards, while empty", async () => {
    consent(true);
    window.localStorage.setItem(
      "recently-viewed",
      JSON.stringify(["test-tee-3-option", "the-minimal-snowboard"]),
    );
    const snowboard = {
      ...results.products[0],
      id: "gid://shopify/Product/2",
      handle: "the-minimal-snowboard",
      title: "The Minimal Snowboard",
      price: { min: usd("885.95"), max: usd("885.95") },
    };
    const fetchSpy = vi.fn(async (url: string) =>
      Response.json({
        products: url.endsWith("the-minimal-snowboard")
          ? [snowboard]
          : results.products,
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);
    render(<SearchBox />);
    await userEvent.click(screen.getByRole("combobox", { name: "Search" }));
    const group = await screen.findByRole("group", { name: "Recently viewed" });
    await waitFor(() =>
      expect(
        within(group)
          .getAllByRole("option")
          .map((o) => o.textContent),
      ).toEqual(["Test Tee, $38.00", "The Minimal Snowboard, $885.95"]),
    );
    // One product a request: no URL holds the visitor's list.
    expect(fetchSpy.mock.calls.map(([url]) => url)).toEqual([
      "/api/commerce/cards?handles=test-tee-3-option",
      "/api/commerce/cards?handles=the-minimal-snowboard",
    ]);
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(push).toHaveBeenCalledWith("/products/test-tee-3-option");
  });

  it("suggests nothing while empty without preferences consent", async () => {
    consent(false);
    window.localStorage.setItem(
      "recently-viewed",
      JSON.stringify(["test-tee-3-option"]),
    );
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(<SearchBox />);
    const input = screen.getByRole("combobox", { name: "Search" });
    await userEvent.click(input);
    await waitFor(() =>
      expect(window.localStorage.getItem("recently-viewed")).toBeNull(),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
