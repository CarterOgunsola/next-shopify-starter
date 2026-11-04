import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  buildDataset,
  parseDataset,
  readDataset,
} from "../../../../e2e/support/dataset.mjs";
import { imageResponse, solidPng } from "../../../../e2e/support/images.mjs";
import {
  createStore,
  serveDataset,
} from "../../../../e2e/support/synthetic-store.mjs";

// Datasets (e2e/support/datasets) for pnpm dev:synthetic and the dev store
// seeder: Storefront API responses shaped like the recordings.

const FIXTURES = join(import.meta.dirname, "fixtures");
const recorded = new Map(
  readdirSync(FIXTURES)
    .filter((file) => file.endsWith(".json"))
    .map((file) => [
      file.slice(0, -".json".length),
      JSON.parse(readFileSync(join(FIXTURES, file), "utf8")).data,
    ]),
);
const template = (name: string) => structuredClone(recorded.get(name));
const IMAGES = "http://localhost:4749";
const sample = readDataset("sample");
const built = buildDataset(sample, template, { imagesUrl: IMAGES });

type Json = Record<string, unknown>;
const data = (name: string) => built.fixtures.get(name) as Json;
const product = (handle: string) =>
  data(`ProductContent.${handle}`).product as {
    variants: { nodes: { id: string; availableForSale: boolean }[] };
    encodedVariantAvailability: string;
    selectedOrFirstAvailableVariant: Json;
    media: { nodes: { image: { url: string; width: number } }[] };
    publishedAt: string;
  };

// Where two responses' shapes differ: a key in one and not the other, at
// any depth. null matches anything; lists compare their first items.
function shapeDiff(a: unknown, b: unknown, path = ""): string[] {
  if (a == null || b == null) return [];
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return [`${path}: list`];
    return a.length && b.length ? shapeDiff(a[0], b[0], `${path}[0]`) : [];
  }
  if (typeof a !== "object" || typeof b !== "object") {
    return typeof a === typeof b ? [] : [`${path}: ${typeof a}`];
  }
  const x = a as Json;
  const y = b as Json;
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].flatMap((key) =>
    key in x && key in y
      ? shapeDiff(x[key], y[key], `${path}.${key}`)
      : [`${path}.${key}`],
  );
}

describe("the sample dataset", () => {
  it("answers every operation in the recorded shape", () => {
    const shapes: [RegExp, string][] = [
      [/^ProductContent\./, "ProductContent.test-tee-3-option"],
      [/^CollectionListing\./, "CollectionListing.test-apparel"],
      [
        /^ProductRecommendations\./,
        "ProductRecommendations.test-electrolytes.related",
      ],
      [/^Menu\./, "Menu.synthetic-nested"],
      [/^ShopPolicies$/, "ShopPolicies"],
    ];
    const names = [...built.fixtures.keys()];
    for (const [pattern] of shapes) {
      expect(
        names.some((name) => pattern.test(name)),
        String(pattern),
      ).toBe(true);
    }
    for (const name of names) {
      const shape = shapes.find(([pattern]) => pattern.test(name));
      expect(shape, name).toBeDefined();
      expect(shapeDiff(data(name), recorded.get(shape![1])), name).toEqual([]);
    }
    // Cards, as collections and search send them.
    const card = recorded.get("CollectionListing.test-apparel").collection
      .products.nodes[0];
    for (const [handle, each] of built.cards) {
      expect(shapeDiff(each, card), handle).toEqual([]);
    }
  });

  it("has a variant per size, with its stock", () => {
    const tee = product("cotton-tee");
    const units = tee.variants.nodes.map((v) => built.stock.get(v.id));
    expect(units).toEqual([20, 20, 3, 20, 20]);
    const shirt = product("linen-shirt");
    expect(shirt.variants.nodes[0].availableForSale).toBe(false);
    expect(shirt.encodedVariantAvailability).toBe("v1_1-4");
    // The first available variant is the default.
    expect(shirt.selectedOrFirstAvailableVariant).toMatchObject({
      title: "S",
      availableForSale: true,
      quantityAvailable: 20,
    });
    const jacket = product("rain-jacket");
    expect(jacket.encodedVariantAvailability).toBe("v1_");
    expect(jacket.selectedOrFirstAvailableVariant).toMatchObject({
      title: "S",
      availableForSale: false,
      quantityAvailable: 0,
    });
    const wallet = product("leather-wallet");
    expect(wallet.selectedOrFirstAvailableVariant).toMatchObject({
      title: "Default Title",
      quantityAvailable: 2,
    });
  });

  it("puts sales and new products on the cards", () => {
    const sweater = built.cards.get("wool-sweater")!;
    expect(sweater.variants.nodes[0].compareAtPrice).toEqual({
      amount: "120.0",
      currencyCode: "USD",
    });
    expect(built.cards.get("rain-jacket")!.availableForSale).toBe(false);
    const now = new Date("2026-11-03T12:00:00Z");
    const later = buildDataset(sample, template, { now });
    expect(later.cards.get("cotton-tee")!.publishedAt).toBe(
      "2026-11-02T12:00:00Z",
    );
    expect(later.cards.get("ceramic-mug")!.publishedAt < "2026-10-01").toBe(
      true,
    );
  });

  it("points images at the image server, or leaves them out without one", () => {
    const shirt = product("linen-shirt");
    expect(shirt.media.nodes).toHaveLength(4);
    expect(shirt.media.nodes[0].image).toEqual({
      url: `${IMAGES}/placeholder/1200x1500/e3e0d8.png`,
      altText: "Linen Shirt",
      width: 1200,
      height: 1500,
    });
    const none = buildDataset(sample, template);
    const media = (none.fixtures.get("ProductContent.linen-shirt") as Json)
      .product as { media: { nodes: unknown[] } };
    expect(media.media.nodes).toEqual([]);
  });

  it("sets only the dataset's policies", () => {
    const { shop } = data("ShopPolicies") as {
      shop: Record<string, { title: string; body: string } | null>;
    };
    expect(shop.shippingPolicy).toEqual({
      handle: "shipping-policy",
      title: "Shipping Policy",
      body: "<p>Orders ship within two working days.</p><p>Standard shipping takes three to five working days.</p>",
    });
    expect(shop.refundPolicy?.title).toBe("Refund Policy");
    expect(shop.subscriptionPolicy).toBeNull();
    expect(shop.privacyPolicy).toBeNull();
  });

  it("builds menus as Shopify sends them, three levels deep", () => {
    const deep = buildDataset(
      {
        products: [{ handle: "mug", title: "Mug", price: "1.00" }],
        collections: [{ handle: "home", title: "Home", products: ["mug"] }],
        menus: {
          "main-menu": [
            {
              title: "Shop",
              items: [
                {
                  title: "Home",
                  url: "/collections/home",
                  items: [{ title: "Search", url: "/search" }],
                },
              ],
            },
            { title: "Elsewhere", url: "https://example.com/" },
          ],
        },
      },
      template,
    );
    const { menu } = deep.fixtures.get("Menu.main-menu") as {
      menu: { items: Json[] };
    };
    expect(menu.items).toEqual([
      {
        title: "Shop",
        type: "HTTP",
        url: "https://synthetic-store.myshopify.com#",
        resource: null,
        items: [
          {
            title: "Home",
            type: "COLLECTION",
            url: "https://synthetic-store.myshopify.com/collections/home",
            resource: { __typename: "Collection", handle: "home" },
            items: [
              {
                title: "Search",
                type: "HTTP",
                url: "https://synthetic-store.myshopify.com/search",
                resource: null,
              },
            ],
          },
        ],
      },
      {
        title: "Elsewhere",
        type: "HTTP",
        url: "https://example.com/",
        resource: null,
        items: [],
      },
    ]);
  });
});

describe("parseDataset", () => {
  const parse = (catalog: unknown) => () =>
    parseDataset(JSON.stringify(catalog), "test.json");

  it("lists everything wrong with a dataset", () => {
    const deep = [
      {
        title: "a",
        items: [{ title: "b", items: [{ title: "c", items: [] }] }],
      },
    ];
    expect(
      parse({
        products: [
          { handle: "tee", title: "Tee", price: "10", sizes: ["S"] },
          { handle: "tee", title: "Again", price: "ten" },
          {
            handle: "Mug",
            title: "",
            price: "5.00",
            compareAtPrice: "4.00",
            stock: { M: 1 },
            images: [{ color: "#fff", file: "a.gif", width: 0, height: 10 }],
          },
        ],
        collections: [
          { handle: "all-things", title: "All", products: ["cup"] },
        ],
        menus: { "main-menu": deep, footer: [{ title: "x", url: "//evil" }] },
        recommendations: { tee: { similar: ["tee"] }, cup: { related: [] } },
        policies: { cookies: "x" },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: test.json:
        products[1].handle repeats tee
        products[1].price must be an amount, like "28.00"
        products[2].handle must be lowercase letters and digits, joined by -
        products[2].title is required
        products[2].compareAtPrice must be more than the price
        products[2].stock must be units, or units per size
        products[2].images[0] needs a color or a file, not both
        products[2].images[0].color must be #rrggbb
        products[2].images[0].file must be a .png, .jpg, .webp or .avif file name
        products[2].images[0] needs a width and height in pixels, up to 4000
        collections[0].products has no product cup
        menus.main-menu[0].items[0].items[0].items go deeper than Shopify's three levels
        menus.footer[0].url must be a path on the site or an http(s) URL
        recommendations.tee.similar isn't related or complementary
        recommendations.cup isn't a product
        policies.cookies isn't one of shipping, refund, privacy, terms]
    `);
  });

  it("checks stock against the product's sizes", () => {
    expect(
      parse({
        products: [
          {
            handle: "tee",
            title: "Tee",
            price: "10.00",
            sizes: ["S", "M"],
            stock: { L: 1, M: -1 },
          },
        ],
      }),
    ).toThrow(/stock has no size L\n.*stock\.M must be units/);
  });

  it("takes the sample", () => {
    expect(readDataset("sample").products.length).toBeGreaterThan(5);
  });

  it("refuses a name that isn't a file in the datasets folder", () => {
    expect(() => readDataset("../fixtures")).toThrow(/No dataset/);
  });
});

describe("a dataset's images", () => {
  it("draws a PNG in one colour", () => {
    const png = solidPng(3, 2, "#336699");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
    const idat = png.indexOf("IDAT");
    const pixels = inflateSync(
      png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)),
    );
    // Two rows, each a filter byte and three RGB pixels.
    const row = [0, ...[0x33, 0x66, 0x99, 0x33, 0x66, 0x99, 0x33, 0x66, 0x99]];
    expect([...pixels]).toEqual([...row, ...row]);
  });

  it("serves placeholders and the dataset's own files, and nothing else", async () => {
    const folder = mkdtempSync(join(tmpdir(), "dataset-images-"));
    writeFileSync(join(folder, "tee.jpg"), "jpeg bytes");
    writeFileSync(join(folder, "notes.txt"), "not an image");

    const drawn = await imageResponse("/placeholder/40x50/d9d4cc.png", folder);
    expect(drawn).toMatchObject({ status: 200, type: "image/png" });
    expect(drawn.body?.readUInt32BE(16)).toBe(40);

    expect(await imageResponse("/tee.jpg", folder)).toMatchObject({
      status: 200,
      type: "image/jpeg",
      body: Buffer.from("jpeg bytes"),
    });
    for (const path of [
      "/notes.txt",
      "/missing.jpg",
      "/..%2F..%2Fpackage.json",
      "/%2E%2E%2Ftee.jpg",
      "/placeholder/9000x10/d9d4cc.png",
      "/placeholder/0x10/d9d4cc.png",
      "/%E0%A4%A",
    ]) {
      expect((await imageResponse(path, folder)).status, path).toBe(404);
    }
  });
});

describe("the synthetic store serving a dataset", () => {
  serveDataset("sample", { imagesUrl: IMAGES });
  const store = createStore();
  const ask = (query: string, variables: Json = {}) =>
    (store.respond({ query, variables }) as { data: Json }).data;

  it("lists the dataset's products in place of the test products", () => {
    const { products } = ask("query ProductCards", { first: 50 }) as {
      products: { nodes: { handle: string }[] };
    };
    expect(products.nodes.map((p) => p.handle)).toEqual([
      "canvas-tote",
      "ceramic-mug",
      "cotton-tee",
      "glass-carafe",
      "knit-beanie",
      "leather-wallet",
      "linen-napkins",
      "linen-shirt",
      "rain-jacket",
      "wool-sweater",
    ]);
    expect(
      ask("query ProductContent", { handle: "test-tee-3-option" }),
    ).toEqual({ product: null });
    const { collections } = ask("query CollectionHandles") as {
      collections: { nodes: { handle: string }[] };
    };
    expect(collections.nodes.map((c) => c.handle)).toEqual([
      "new-arrivals",
      "apparel",
      "accessories",
      "home",
    ]);
  });

  it("searches titles, types and descriptions by word", () => {
    const search = (query: string) =>
      (
        ask("query Search", { query }) as {
          search: { nodes: { handle: string }[]; totalCount: number };
        }
      ).search.nodes.map((p) => p.handle);
    expect(search("mugs")).toEqual(["ceramic-mug"]);
    expect(search("lin")).toEqual(["linen-napkins", "linen-shirt"]);
    expect(search("linen shirt")).toEqual(["linen-shirt"]);
    expect(search("home")).toEqual([
      "ceramic-mug",
      "glass-carafe",
      "linen-napkins",
    ]);
    expect(search("inen")).toEqual([]);
    const { predictiveSearch } = ask("query PredictiveSearch", {
      query: "acc",
      limit: 2,
    }) as {
      predictiveSearch: {
        products: { handle: string }[];
        collections: { handle: string }[];
      };
    };
    expect(predictiveSearch.products.map((p) => p.handle)).toEqual([
      "knit-beanie",
      "leather-wallet",
    ]);
    expect(predictiveSearch.collections.map((c) => c.handle)).toEqual([
      "accessories",
    ]);
  });

  it("keeps each size's stock", () => {
    const tee = product("cotton-tee").variants.nodes;
    const { product: view } = ask("query VariantView", {
      handle: "cotton-tee",
      selectedOptions: [{ name: "Size", value: "M" }],
    }) as { product: { selectedOrFirstAvailableVariant: Json } };
    expect(view.selectedOrFirstAvailableVariant).toMatchObject({
      id: tee[2].id,
      quantityAvailable: 3,
    });
    const { cartCreate } = ask("mutation CartCreate", {
      input: { lines: [{ merchandiseId: tee[2].id, quantity: 5 }] },
    }) as {
      cartCreate: { cart: { totalQuantity: number }; warnings: Json[] };
    };
    expect(cartCreate.cart.totalQuantity).toBe(3);
    expect(cartCreate.warnings[0]).toMatchObject({
      code: "MERCHANDISE_NOT_ENOUGH_STOCK",
    });
  });

  it("has the dataset's menus and no others", () => {
    const menu = (handle: string) =>
      (ask("query Menu", { handle }) as { menu: unknown }).menu;
    expect(menu("main-menu")).toMatchObject({
      items: [{ title: "Shop" }, { title: "New arrivals" }],
    });
    expect(menu("sidebar")).toBeNull();
  });
});
