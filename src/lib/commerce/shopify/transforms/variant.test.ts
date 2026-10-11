import { describe, expect, it } from "vitest";
import matrix from "../../testing/fixtures/VariantMatrix.the-complete-snowboard.json";
import skiWax from "../../testing/fixtures/VariantView.selling-plans-ski-wax.default.json";
import ice from "../../testing/fixtures/VariantView.the-complete-snowboard.ice.json";
import outOfStock from "../../testing/fixtures/VariantView.the-out-of-stock-snowboard.default.json";
import { decodeEncodedVariants } from "../encoded-variants";
import type { VariantViewData } from "../operations/variants";
import tee from "../../testing/fixtures/VariantView.test-tee-3-option.black-xl.json";
import electrolytes from "../../testing/fixtures/VariantView.test-electrolytes.default.json";
import { closestCombination, toVariantView } from "./variant";

const view = (fixture: { data: { product: unknown } }) =>
  toVariantView(fixture.data.product as VariantViewData);

const money = (amount: string) => ({ amount, currencyCode: "USD" as const });

describe("toVariantView", () => {
  it("returns the resolved variant with live price and stock", () => {
    const { variant, options } = view(ice);
    expect(variant).toMatchObject({
      title: "Ice",
      available: true,
      price: money("699.95"),
      selectedOptions: [{ name: "Color", value: "Ice" }],
    });
    expect(variant).not.toHaveProperty("compareAtPrice");
    const [color] = options;
    expect(color.name).toBe("Color");
    expect(color.values.filter((v) => v.selected).map((v) => v.name)).toEqual([
      "Ice",
    ]);
    expect(color.values.every((v) => v.exists && v.available)).toBe(true);
  });

  it("says how many are left only when few are", () => {
    // Recorded with 6 in stock: above the threshold.
    expect(view(tee).variant).not.toHaveProperty("lowStock");
    const product = tee.data.product;
    const low = {
      data: {
        product: {
          ...product,
          selectedOrFirstAvailableVariant: {
            ...product.selectedOrFirstAvailableVariant,
            quantityAvailable: 3,
          },
        },
      },
    };
    expect(view(low as typeof tee).variant?.lowStock).toBe(3);
  });

  it("marks a sold-out product and hides the placeholder option", () => {
    const { variant, options } = view(outOfStock);
    expect(variant?.available).toBe(false);
    expect(options).toEqual([]);
  });

  it("includes selling plan prices", () => {
    const { variant } = view(skiWax);
    expect(variant?.sellingPlanPrices).toHaveLength(2);
    for (const plan of variant?.sellingPlanPrices ?? []) {
      expect(plan.planId).toMatch(/^gid:\/\/shopify\/SellingPlan\//);
      expect(plan.price.currencyCode).toBe("USD");
    }
  });

  it("gives plan prices per delivery, with the saving and a prepaid plan's charge", () => {
    const { variant } = view(skiWax);
    const usd = (amount: string) => ({ amount, currencyCode: "USD" });
    expect(variant?.sellingPlanPrices).toEqual([
      // Weekly: 21.21 instead of 24.95, 14.99% off: 14%, never rounded up.
      {
        planId: "gid://shopify/SellingPlan/3291644110",
        price: usd("21.21"),
        savingsPercent: 14,
      },
      // Prepaid year: 19.96 a delivery, 239.52 at checkout (299.40 at the
      // one-time price).
      {
        planId: "gid://shopify/SellingPlan/3291676878",
        price: usd("19.96"),
        savingsPercent: 20,
        checkoutCharge: usd("239.52"),
      },
    ]);
  });

  it("leads with the ongoing saving and names an introductory one", async () => {
    // Recorded: the electrolytes intro offer, 50% off the first 3 orders,
    // then 10%, on a $24.00 price.
    const { variant } = view(electrolytes);
    const usd = (amount: string) => ({ amount, currencyCode: "USD" });
    const intro = variant?.sellingPlanPrices.find(
      (p) => p.planId === "gid://shopify/SellingPlan/3294036174",
    );
    expect(intro).toEqual({
      planId: "gid://shopify/SellingPlan/3294036174",
      price: usd("12.0"),
      savingsPercent: 10,
      introSavingsPercent: 50,
      later: usd("21.6"),
    });
    // In words, with the plan's terms from the recorded content.
    const { productContent } = await import("../../testing/factories");
    const { planOffers, planPriceText } = await import("../../selling-plans");
    const offer = planOffers(
      productContent("electrolytes").sellingPlanGroups,
      variant!,
    ).find((o) => o.id === intro?.planId);
    expect(offer && planPriceText(offer)).toBe(
      "$12.00 a delivery for the first 3 orders, then $21.60, save 50% on your first 3 orders, then 10%",
    );
  });

  it("shows a compare-at price only when it's higher", () => {
    const product = structuredClone(ice.data.product) as VariantViewData;
    const variant = product.selectedOrFirstAvailableVariant!;
    variant.compareAtPrice = money("799.95");
    expect(toVariantView(product).variant?.compareAtPrice).toEqual(
      money("799.95"),
    );
    variant.compareAtPrice = money("699.95");
    expect(toVariantView(product).variant).not.toHaveProperty("compareAtPrice");
  });

  it("flags values per option given the rest of the selection", () => {
    // Shopify's documented example: [Size, Color, Material], selected
    // Medium / Red / Wool. Large / Red / Wool exists but is sold out.
    const product = structuredClone(ice.data.product) as VariantViewData;
    product.options = [
      {
        name: "Size",
        optionValues: [
          { name: "Small" },
          { name: "Medium" },
          { name: "Large" },
        ],
      },
      { name: "Color", optionValues: [{ name: "Red" }, { name: "Blue" }] },
      {
        name: "Material",
        optionValues: [{ name: "Cotton" }, { name: "Wool" }],
      },
    ];
    product.encodedVariantExistence =
      "v1_0:0:0,1:0-1,,1:0:0-1,1:1,,2:0:1,1:0,,";
    product.encodedVariantAvailability = "v1_0:0:0,1:0-1,,1:0:0-1,1:1,,2:1:0,,";
    product.selectedOrFirstAvailableVariant!.selectedOptions = [
      { name: "Size", value: "Medium" },
      { name: "Color", value: "Red" },
      { name: "Material", value: "Wool" },
    ];

    const [size, color, material] = toVariantView(product).options;
    expect(size.values).toEqual([
      { name: "Small", selected: false, exists: false, available: false },
      { name: "Medium", selected: true, exists: true, available: true },
      { name: "Large", selected: false, exists: true, available: false },
    ]);
    expect(color.values.map((v) => [v.name, v.exists, v.available])).toEqual([
      ["Red", true, true],
      ["Blue", true, true],
    ]);
    expect(material.values.map((v) => [v.name, v.exists])).toEqual([
      ["Cotton", true],
      ["Wool", true],
    ]);
  });
});

describe("decodeEncodedVariants against store data", () => {
  it("matches the product's actual variants", () => {
    const {
      options,
      encodedVariantExistence,
      encodedVariantAvailability,
      variants,
    } = matrix.data.product;
    const indexes = (selected: { name: string; value: string }[]) =>
      options.map((option) =>
        option.optionValues.findIndex(
          (value) =>
            value.name === selected.find((s) => s.name === option.name)?.value,
        ),
      );
    const all = variants.nodes.map((v) => indexes(v.selectedOptions));
    const inStock = variants.nodes
      .filter((v) => v.availableForSale)
      .map((v) => indexes(v.selectedOptions));
    const sort = (list: number[][]) => list.map((c) => c.join(":")).sort();

    expect(sort(decodeEncodedVariants(encodedVariantExistence))).toEqual(
      sort(all),
    );
    expect(sort(decodeEncodedVariants(encodedVariantAvailability))).toEqual(
      sort(inStock),
    );
  });
});

describe("closestCombination", () => {
  const product = tee.data.product as VariantViewData;
  const values = (wanted: { name: string; value: string }[]) =>
    closestCombination(product, wanted)?.map((o) => o.value);

  it("keeps a requested value that exists, even when sold out", () => {
    expect(
      values([
        { name: "Color", value: "Black" },
        { name: "Size", value: "XL" },
      ]),
    ).toEqual(["Black", "XL", "Regular"]);
  });

  it("drops a later value that can't go with an earlier one", () => {
    expect(
      values([
        { name: "color", value: "forest" },
        { name: "Fit", value: "Relaxed" },
      ]),
    ).toEqual(["Forest", "XS", "Regular"]);
  });

  it("prefers an available variant for the values left open", () => {
    expect(values([{ name: "Color", value: "Navy" }])).toEqual([
      "Navy",
      "XS",
      "Regular",
    ]);
  });

  it("is null when nothing exists", () => {
    expect(
      closestCombination({ ...product, encodedVariantExistence: "" }, []),
    ).toBeNull();
  });
});

describe("option flags for a requested selection", () => {
  const product = tee.data.product as VariantViewData;
  const flags = (
    requested: { name: string; value: string }[],
    option: string,
    value: string,
  ) =>
    toVariantView(product, requested)
      .options.find((o) => o.name === option)
      ?.values.find((v) => v.name === value);

  it("judges values against what the visitor chose, not the fallback", () => {
    // Black S comes in Relaxed; Forest only comes in Regular.
    const size = { name: "Size", value: "S" };
    expect(
      flags([{ name: "Color", value: "Black" }, size], "Fit", "Relaxed")
        ?.exists,
    ).toBe(true);
    expect(
      flags([{ name: "Color", value: "Forest" }, size], "Fit", "Relaxed")
        ?.exists,
    ).toBe(false);
  });

  it("marks a chosen sold-out value's siblings by the chosen values", () => {
    // Black XL exists but is sold out: XL is marked so under Black.
    const xl = flags([{ name: "Color", value: "Black" }], "Size", "XL");
    expect(xl).toMatchObject({ exists: true, available: false });
  });

  it("keeps selected on the variant Shopify returned", () => {
    expect(
      flags([{ name: "Color", value: "Forest" }], "Color", "Black")?.selected,
    ).toBe(true);
  });
});
