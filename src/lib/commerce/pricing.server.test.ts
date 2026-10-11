import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVariantView } from "./pricing.server";
import partial from "./testing/fixtures/VariantView.test-tee-3-option.black-xl.json";
import { server, shopify } from "./testing/msw";

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-real-ip": "203.0.113.7" }),
}));

const buyer = { audience: "consumer" } as const;
type Option = { name: string; value: string };

// The tee fixture resolved ?color=black&size=xl to Black / XS / Regular.
// Answer each request with that payload, re-pointed at the options asked
// for when they name a full combination.
function respond(sold: (options: Option[]) => boolean) {
  const calls: Option[][] = [];
  server.use(
    shopify.query("VariantView", ({ variables }) => {
      const asked = variables.selectedOptions as Option[];
      calls.push(asked);
      const product = structuredClone(partial.data.product);
      const variant = product.selectedOrFirstAvailableVariant!;
      if (asked.length === 3) {
        variant.selectedOptions = asked;
        variant.availableForSale = !sold(asked);
      }
      return HttpResponse.json({ data: { product } });
    }),
  );
  return calls;
}

beforeEach(() => vi.spyOn(console, "warn").mockImplementation(() => {}));

describe("getVariantView", () => {
  it("keeps a chosen sold-out value instead of Shopify's first available pick", async () => {
    const calls = respond((o) => o[1].value === "XL");

    const view = await getVariantView(
      "test-tee-3-option",
      { Color: "Black", Size: "XL" },
      buyer,
    );

    expect(calls).toEqual([
      [
        { name: "Color", value: "Black" },
        { name: "Size", value: "XL" },
      ],
      [
        { name: "Color", value: "Black" },
        { name: "Size", value: "XL" },
        { name: "Fit", value: "Regular" },
      ],
    ]);
    expect(view?.variant?.selectedOptions.map((o) => o.value)).toEqual([
      "Black",
      "XL",
      "Regular",
    ]);
    expect(view?.variant?.available).toBe(false);
  });

  it("keeps as many requested values as exist together, earlier options first", async () => {
    // The tee has no Forest Relaxed: Forest only comes in Regular.
    const calls = respond(() => false);
    const view = await getVariantView(
      "test-tee-3-option",
      { Color: "Forest", Fit: "Relaxed" },
      buyer,
    );
    expect(calls[1]).toEqual([
      { name: "Color", value: "Forest" },
      { name: "Size", value: "XS" },
      { name: "Fit", value: "Regular" },
    ]);
    expect(view?.variant?.selectedOptions.map((o) => o.value)).toEqual([
      "Forest",
      "XS",
      "Regular",
    ]);
  });

  it("makes one request when Shopify's pick already matches", async () => {
    const calls = respond(() => false);
    const view = await getVariantView(
      "test-tee-3-option",
      { Color: "Black" },
      buyer,
    );
    expect(calls).toEqual([[{ name: "Color", value: "Black" }]]);
    // Shopify's pick for Black, as it answered.
    expect(view?.variant?.selectedOptions.map((o) => o.value)).toEqual([
      "Black",
      "XS",
      "Regular",
    ]);
  });

  it("reads a Shopify ?variant= id and checks it belongs to the product", async () => {
    let asked: unknown;
    server.use(
      shopify.query("VariantOptions", ({ variables }) => {
        asked = variables.id;
        return HttpResponse.json({
          data: {
            node: {
              selectedOptions: [
                { name: "Color", value: "Navy" },
                { name: "Size", value: "M" },
                { name: "Fit", value: "Relaxed" },
              ],
              product: { handle: "test-tee-3-option" },
            },
          },
        });
      }),
    );
    const calls = respond(() => false);

    const view = await getVariantView("test-tee-3-option", {}, buyer, "123");

    expect(asked).toBe("gid://shopify/ProductVariant/123");
    expect(calls[0]).toEqual([
      { name: "Color", value: "Navy" },
      { name: "Size", value: "M" },
      { name: "Fit", value: "Relaxed" },
    ]);
    expect(view?.variant?.selectedOptions.map((o) => o.value)).toEqual([
      "Navy",
      "M",
      "Relaxed",
    ]);
  });

  it("ignores a ?variant= id from another product", async () => {
    server.use(
      shopify.query("VariantOptions", () =>
        HttpResponse.json({
          data: {
            node: {
              selectedOptions: [{ name: "Size", value: "L" }],
              product: { handle: "something-else" },
            },
          },
        }),
      ),
    );
    const calls = respond(() => false);
    const view = await getVariantView("test-tee-3-option", {}, buyer, "123");
    // Asked with nothing selected: Shopify's first available variant.
    expect(calls).toEqual([[]]);
    expect(view?.variant?.selectedOptions.map((o) => o.value)).toEqual([
      "Black",
      "XS",
      "Regular",
    ]);
  });
});
