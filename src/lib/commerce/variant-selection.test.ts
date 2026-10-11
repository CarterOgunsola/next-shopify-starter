import { describe, expect, it } from "vitest";
import type { ProductOption, VariantView } from "./types";
import {
  addDisabledReason,
  hasOptionParams,
  leadWith,
  matchesSelection,
  parseVariantId,
  variantImageFor,
  parseSelection,
  selectionKey,
  selectionSearch,
  slug,
  variantAnnouncement,
  variantSelection,
  withSelection,
} from "./variant-selection";

const options: ProductOption[] = [
  { name: "Flavor", values: [{ name: "Lemon" }, { name: "Fruit Punch" }] },
  { name: "Size", values: [{ name: "30 Servings" }, { name: "60 Servings" }] },
];

const params = (query: string) => new URLSearchParams(query);

describe("parseSelection", () => {
  it("matches names and values regardless of case and spacing", () => {
    expect(
      parseSelection(params("flavor=fruit-punch&SIZE=30%20servings"), options),
    ).toEqual({ Flavor: "Fruit Punch", Size: "30 Servings" });
  });

  it("ignores unknown names and values", () => {
    expect(
      parseSelection(params("flavor=grape&color=red&utm_source=x"), options),
    ).toEqual({});
  });
});

describe("selectionSearch", () => {
  it("writes options in product order as slugs and keeps other params", () => {
    expect(
      selectionSearch(params("utm_source=email&size=bad&FLAVOR=x"), options, {
        Size: "60 Servings",
        Flavor: "Lemon",
      }),
    ).toBe("?utm_source=email&flavor=lemon&size=60-servings");
  });

  it("returns an empty string when there's nothing to keep", () => {
    expect(selectionSearch(params(""), options, {})).toBe("");
  });
});

describe("values whose slugs collide or are empty", () => {
  const sizes: ProductOption[] = [
    { name: "Size", values: [{ name: "XL" }, { name: "XL+" }, { name: "M" }] },
    { name: "Taste", values: [{ name: "抹茶" }, { name: "ほうじ茶" }] },
  ];

  it("writes the value as is when its slug isn't unique or is empty", () => {
    const search = selectionSearch(new URLSearchParams(), sizes, {
      Size: "XL+",
      Taste: "抹茶",
    });
    const params = new URLSearchParams(search);
    expect(params.get("size")).toBe("XL+");
    expect(params.get("taste")).toBe("抹茶");
    expect(parseSelection(params, sizes)).toEqual({
      Size: "XL+",
      Taste: "抹茶",
    });
  });

  it("selects each colliding value by its exact spelling", () => {
    expect(parseSelection(params("size=XL"), sizes)).toEqual({ Size: "XL" });
    expect(parseSelection(params("size=xl%2B"), sizes)).toEqual({
      Size: "XL+",
    });
    expect(parseSelection(params("taste=ほうじ茶"), sizes)).toEqual({
      Taste: "ほうじ茶",
    });
  });

  it("keeps slugs where they're unique", () => {
    expect(
      new URLSearchParams(
        selectionSearch(new URLSearchParams(), sizes, { Size: "M" }),
      ).get("size"),
    ).toBe("m");
  });
});

describe("helpers", () => {
  it("slugs text", () => {
    expect(slug("  Fruit Punch (Limited) ")).toBe("fruit-punch-limited");
    expect(slug("Açaí")).toBe("acai");
  });

  it("detects option params", () => {
    expect(hasOptionParams(params("utm_source=x"), options)).toBe(false);
    expect(hasOptionParams(params("Size=whatever"), options)).toBe(true);
  });

  it("compares selections by content, not key order", () => {
    expect(selectionKey({ a: "1", b: "2" })).toBe(
      selectionKey({ b: "2", a: "1" }),
    );
  });

  it("reads a variant's selection without placeholder options", () => {
    expect(
      variantSelection(
        {
          selectedOptions: [
            { name: "Flavor", value: "Lemon" },
            { name: "Title", value: "Default Title" },
          ],
        },
        options,
      ),
    ).toEqual({ Flavor: "Lemon" });
  });
});

describe("withSelection", () => {
  it("shows the URL's choice before the live state catches up", () => {
    const live = [
      {
        name: "Flavor",
        values: [
          { name: "Lemon", selected: true, exists: true, available: true },
          {
            name: "Fruit Punch",
            selected: false,
            exists: true,
            available: false,
          },
        ],
      },
      {
        name: "Size",
        values: [
          {
            name: "30 Servings",
            selected: true,
            exists: true,
            available: true,
          },
        ],
      },
    ];
    const [flavor, size] = withSelection(live, { Flavor: "Fruit Punch" });
    expect(flavor.values.map((v) => [v.name, v.selected, v.available])).toEqual(
      [
        ["Lemon", false, true],
        ["Fruit Punch", true, false],
      ],
    );
    expect(size).toBe(live[1]);
  });
});

describe("Shopify ?variant= links", () => {
  it("reads a numeric variant id", () => {
    expect(parseVariantId(params("variant=48430713307342"))).toBe(
      "48430713307342",
    );
    expect(parseVariantId(params("variant=gid://x"))).toBeNull();
    expect(parseVariantId(params(""))).toBeNull();
  });

  it("is rewritten to option params", () => {
    expect(hasOptionParams(params("variant=1"), options)).toBe(true);
    expect(
      selectionSearch(params("variant=1&utm_source=feed"), options, {
        Flavor: "Lemon",
      }),
    ).toBe("?utm_source=feed&flavor=lemon");
  });
});

describe("matchesSelection", () => {
  const variant = {
    selectedOptions: [
      { name: "Flavor", value: "Lemon" },
      { name: "Size", value: "30 Servings" },
    ],
  };
  it("checks every selected value", () => {
    expect(matchesSelection(variant, { Flavor: "Lemon" })).toBe(true);
    expect(matchesSelection(variant, { Size: "60 Servings" })).toBe(false);
    expect(matchesSelection(variant, {})).toBe(true);
  });
});

describe("variant images", () => {
  const images = [
    {
      options: { Color: "Black", Size: "XS" },
      url: "https://cdn.shopify.com/s/files/black.jpg?v=1",
    },
    {
      options: { Color: "Navy", Size: "XS" },
      url: "https://cdn.shopify.com/s/files/navy.jpg?v=1",
    },
  ];

  it("finds the image for a partial selection", () => {
    expect(variantImageFor({ Color: "Navy" }, images)).toBe(images[1].url);
    expect(variantImageFor({}, images)).toBeNull();
    expect(variantImageFor({ Color: "Teal" }, images)).toBeNull();
  });

  it("moves the matching image to the front, ignoring query params", () => {
    const image = (name: string) => ({
      kind: "image" as const,
      image: {
        url: `https://cdn.shopify.com/s/files/${name}.jpg?v=2&width=1`,
        altText: name,
        width: 1,
        height: 1,
      },
    });
    const media = [image("black"), image("bone"), image("navy")];
    expect(
      leadWith(media, images[1].url).map(
        (m) => m.kind === "image" && m.image.altText,
      ),
    ).toEqual(["navy", "black", "bone"]);
    expect(leadWith(media, null)).toBe(media);
  });
});

describe("addDisabledReason", () => {
  const view = (available: boolean): VariantView => ({
    productId: "gid://shopify/Product/1",
    options: [],
    variant: {
      id: "gid://shopify/ProductVariant/1",
      title: "Lemon",
      sku: null,
      selectedOptions: [],
      available,
      price: { amount: "10.0", currencyCode: "USD" },
      sellingPlanPrices: [],
    },
  });

  it("explains every disabled state", () => {
    expect(addDisabledReason("loading", null, {})).toBe(
      "Checking price and stock.",
    );
    expect(addDisabledReason("error", view(true), {})).toBe(
      "Price and stock couldn't load.",
    );
    expect(
      addDisabledReason(
        "ready",
        { productId: "gid://shopify/Product/1", options: [], variant: null },
        {},
      ),
    ).toBe("This product isn't available.");
    expect(addDisabledReason("ready", view(false), {})).toBe("Sold out.");
    expect(addDisabledReason("ready", view(true), {})).toBeNull();
    expect(addDisabledReason("ready", view(true), { Flavor: "Lemon" })).toBe(
      "This combination isn't available.",
    );
  });
});

describe("variantAnnouncement", () => {
  const variant = {
    id: "gid://shopify/ProductVariant/1",
    title: "Default Title",
    sku: null,
    selectedOptions: [],
    available: false,
    price: { amount: "885.95", currencyCode: "USD" },
    sellingPlanPrices: [],
  };

  it("names the variant only when the product has options", () => {
    expect(variantAnnouncement(variant, false)).toBe("$885.95, sold out.");
    expect(
      variantAnnouncement(
        { ...variant, title: "Lemon", available: true },
        true,
      ),
    ).toBe("Lemon: $885.95, in stock.");
  });
});
