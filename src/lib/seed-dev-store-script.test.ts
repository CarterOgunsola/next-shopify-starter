import { describe, expect, it } from "vitest";
import { readDataset } from "../../e2e/support/dataset.mjs";
import {
  collectionInput,
  imagesOf,
  menuItemsInput,
  menuTitle,
  parseArgs,
  policyInputs,
  productSetInput,
  recommendationMetafields,
} from "../../scripts/seed-dev-store.mjs";

// The dev store seeder's inputs, built from a dataset. Nothing here talks
// to a store.

const sample = readDataset("sample");
const product = (handle: string) =>
  sample.products.find((p) => p.handle === handle)!;
const STORE = "seed-test.myshopify.com";
const LOCATION = "gid://shopify/Location/1";
const staged = new Map(
  imagesOf(sample).map((image) => [image.key, `staged:${image.filename}`]),
);
const input = (handle: string) =>
  productSetInput(product(handle), { locationId: LOCATION, staged });

describe("pnpm seed:dev-store", () => {
  it("takes a myshopify.com store and a dataset, sample by default", () => {
    expect(parseArgs([STORE])).toEqual({ store: STORE, dataset: "sample" });
    expect(parseArgs([STORE, "mine"])).toEqual({
      store: STORE,
      dataset: "mine",
    });
    for (const args of [
      [],
      ["shop.example.com"],
      ["https://seed-test.myshopify.com"],
      [STORE, "sample", "extra"],
    ]) {
      expect(parseArgs(args).error, args.join(" ")).toMatch(/Usage/);
    }
  });

  it("uploads each image once, placeholders as PNGs", () => {
    const images = imagesOf(sample);
    const keys = images.map((image) => image.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(images[0]).toMatchObject({
      key: "/placeholder/1200x1500/d9d4cc.png",
      filename: "placeholder-d9d4cc-1200x1500.png",
      mimeType: "image/png",
    });
    // The collection's image too.
    expect(keys).toContain("/placeholder/1600x900/cdc6ba.png");
    const own = imagesOf({
      products: [
        {
          handle: "tee",
          title: "Tee",
          price: "1.00",
          images: [{ file: "tee-front.jpg", width: 10, height: 10 }],
        },
      ],
    });
    expect(own).toMatchObject([
      {
        key: "/tee-front.jpg",
        filename: "tee-front.jpg",
        mimeType: "image/jpeg",
      },
    ]);
  });

  it("sets a product's sizes, stock, price and images", () => {
    const tee = input("cotton-tee");
    expect(tee).toMatchObject({
      handle: "cotton-tee",
      title: "Cotton Tee",
      productType: "Tops",
      status: "ACTIVE",
      descriptionHtml:
        "<p>A plain crew-neck tee in midweight cotton.</p><ul><li>100% cotton</li><li>Regular fit</li><li>Machine wash cold</li></ul>",
      productOptions: [
        {
          name: "Size",
          position: 1,
          values: ["XS", "S", "M", "L", "XL"].map((name) => ({ name })),
        },
      ],
    });
    expect(tee.variants[2]).toEqual({
      optionValues: [{ optionName: "Size", name: "M" }],
      price: "28.00",
      compareAtPrice: null,
      inventoryPolicy: "DENY",
      inventoryItem: { tracked: true, sku: "COTTON-TEE-M" },
      inventoryQuantities: [
        { locationId: LOCATION, name: "available", quantity: 3 },
      ],
    });
    expect(tee.files).toEqual([
      {
        originalSource: "staged:placeholder-d9d4cc-1200x1500.png",
        contentType: "IMAGE",
        alt: "Cotton Tee",
      },
      {
        originalSource: "staged:placeholder-c7c0b4-1200x1500.png",
        contentType: "IMAGE",
        alt: "Cotton Tee",
      },
    ]);
    expect(input("wool-sweater").variants[0].compareAtPrice).toBe("120.00");
    const quantities = (handle: string) =>
      input(handle).variants.map(
        (variant: { inventoryQuantities: { quantity: number }[] }) =>
          variant.inventoryQuantities[0].quantity,
      );
    expect(quantities("rain-jacket")).toEqual([0, 0, 0, 0]);
    expect(quantities("linen-shirt")).toEqual([0, 20, 20, 20, 20]);
  });

  it("gives a product without sizes Shopify's one default variant", () => {
    const wallet = input("leather-wallet");
    expect(wallet.productOptions).toEqual([
      { name: "Title", position: 1, values: [{ name: "Default Title" }] },
    ]);
    expect(wallet.variants).toHaveLength(1);
    expect(wallet.variants[0]).toMatchObject({
      optionValues: [{ optionName: "Title", name: "Default Title" }],
      inventoryItem: { sku: "LEATHER-WALLET" },
      inventoryQuantities: [{ quantity: 2 }],
    });
  });

  it("sets a collection in the dataset's order, with its image", () => {
    const [arrivals, apparel] = sample.collections!;
    expect(
      collectionInput(arrivals, { imageSrc: "https://cdn/x.png" }),
    ).toEqual({
      handle: "new-arrivals",
      title: "New arrivals",
      descriptionHtml: "<p>The latest additions to the shop.</p>",
      sortOrder: "MANUAL",
      image: { src: "https://cdn/x.png", altText: "New arrivals" },
    });
    expect(collectionInput(apparel)).toEqual({
      handle: "apparel",
      title: "Apparel",
      descriptionHtml: "",
      sortOrder: "MANUAL",
    });
  });

  it("links menus to collections, and types headings as #", () => {
    const collectionIds = new Map([
      ["apparel", "gid://shopify/Collection/1"],
      ["new-arrivals", "gid://shopify/Collection/2"],
    ]);
    const items = menuItemsInput(sample.menus!["main-menu"], {
      store: STORE,
      collectionIds,
    });
    expect(items[0]).toMatchObject({ title: "Shop", type: "HTTP", url: "#" });
    expect(items[0].items.slice(0, 2)).toEqual([
      // No collection called all: the site's own listing.
      {
        title: "All products",
        type: "HTTP",
        url: `https://${STORE}/collections/all`,
        items: [],
      },
      {
        title: "Apparel",
        type: "COLLECTION",
        resourceId: "gid://shopify/Collection/1",
        items: [],
      },
    ]);
    expect(
      menuItemsInput([{ title: "Elsewhere", url: "https://example.com/" }], {
        store: STORE,
        collectionIds,
      }),
    ).toEqual([
      {
        title: "Elsewhere",
        type: "HTTP",
        url: "https://example.com/",
        items: [],
      },
    ]);
    expect(menuTitle("main-menu")).toBe("Main menu");
  });

  it("sets the recommendations in Search & Discovery's metafields", () => {
    const productIds = new Map(
      sample.products.map((p, i) => [p.handle, `gid://shopify/Product/${i}`]),
    );
    const metafields = recommendationMetafields(sample, productIds);
    expect(metafields.map((m: { key: string }) => m.key)).toEqual([
      "related_products",
      "complementary_products",
      "related_products",
      "related_products",
      "complementary_products",
    ]);
    expect(metafields[1]).toEqual({
      ownerId: productIds.get("cotton-tee"),
      namespace: "shopify--discovery--product_recommendation",
      key: "complementary_products",
      type: "list.product_reference",
      value: JSON.stringify([productIds.get("canvas-tote")]),
    });
  });

  it("sets the dataset's policies, a paragraph per line", () => {
    expect(policyInputs(sample)).toEqual([
      {
        type: "SHIPPING_POLICY",
        body: "<p>Orders ship within two working days.</p><p>Standard shipping takes three to five working days.</p>",
      },
      {
        type: "REFUND_POLICY",
        body: "<p>Return unused items within 30 days for a full refund.</p><p>Start a return from your account.</p>",
      },
    ]);
  });
});
