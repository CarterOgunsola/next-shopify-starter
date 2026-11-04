// A dataset: a catalog file (e2e/support/datasets/<name>.json, described
// in e2e/README.md) that `pnpm dev:synthetic` serves in place of the test
// products, and that scripts/seed-dev-store.mjs copies into a real dev
// store. buildDataset turns it into Storefront API responses, each taking
// its shape from a recorded fixture of the same operation, so the site
// reads it exactly as it reads Shopify.
//
// No import.meta: Playwright loads this as CommonJS (synthetic-store.mjs).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IMAGE_FILE, imagePath, MAX_SIDE } from "./images.mjs";

export const DATASETS = join(process.cwd(), "e2e/support/datasets");
const ORIGIN = "https://synthetic-store.myshopify.com";
// When every product was published, except those marked new (yesterday).
const PUBLISHED_AT = "2026-01-05T09:00:00Z";
// Units of each variant unless the dataset says otherwise.
const DEFAULT_STOCK = 20;
// Shopify's variant for a product without options.
const DEFAULT_TITLE = "Default Title";
const DAY = 24 * 60 * 60 * 1000;

// The policies a dataset can set, by key: Shopify's field, handle and
// title on the storefront, and its type in the Admin API.
export const POLICIES = {
  shipping: {
    field: "shippingPolicy",
    handle: "shipping-policy",
    title: "Shipping Policy",
    type: "SHIPPING_POLICY",
  },
  refund: {
    field: "refundPolicy",
    handle: "refund-policy",
    title: "Refund Policy",
    type: "REFUND_POLICY",
  },
  privacy: {
    field: "privacyPolicy",
    handle: "privacy-policy",
    title: "Privacy Policy",
    type: "PRIVACY_POLICY",
  },
  terms: {
    field: "termsOfService",
    handle: "terms-of-service",
    title: "Terms of Service",
    type: "TERMS_OF_SERVICE",
  },
};

const NAME = /^[\w-]+$/;
const HANDLE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function datasetPath(name) {
  if (!NAME.test(name)) {
    throw new Error(
      `No dataset ${JSON.stringify(name)}: a name is letters, digits, _ and -.`,
    );
  }
  return join(DATASETS, `${name}.json`);
}

// Where a dataset's own image files are (kept out of git).
export const imagesFolder = (name) => join(DATASETS, name, "images");

export function readDataset(name) {
  return parseDataset(readFileSync(datasetPath(name), "utf8"), `${name}.json`);
}

// The parsed catalog, or an error listing everything wrong with it.
export function parseDataset(text, label = "The dataset") {
  const catalog = JSON.parse(text);
  const problems = datasetProblems(catalog);
  if (problems.length) {
    throw new Error(`${label}:\n  ${problems.join("\n  ")}`);
  }
  return catalog;
}

function datasetProblems(catalog) {
  const problems = [];
  const fail = (at, message) => problems.push(`${at} ${message}`);
  const isText = (value) => typeof value === "string" && value.trim() !== "";
  const isAmount = (value) =>
    typeof value === "string" && /^\d+(\.\d{1,2})?$/.test(value);
  const isList = (value) => Array.isArray(value);
  const isObject = (value) =>
    Boolean(value) && typeof value === "object" && !isList(value);
  const isUnits = (value) => Number.isInteger(value) && value >= 0;

  function image(entry, at) {
    if (!isObject(entry)) return fail(at, "must be an object");
    if (Boolean(entry.color) === Boolean(entry.file)) {
      fail(at, "needs a color or a file, not both");
    }
    if (entry.color && !/^#[0-9a-f]{6}$/i.test(entry.color)) {
      fail(`${at}.color`, "must be #rrggbb");
    }
    if (entry.file && !IMAGE_FILE.test(entry.file)) {
      fail(`${at}.file`, "must be a .png, .jpg, .webp or .avif file name");
    }
    const side = (value) =>
      Number.isInteger(value) && value > 0 && value <= MAX_SIDE;
    if (!side(entry.width) || !side(entry.height)) {
      fail(at, `needs a width and height in pixels, up to ${MAX_SIDE}`);
    }
    if (entry.alt !== undefined && typeof entry.alt !== "string") {
      fail(`${at}.alt`, "must be text");
    }
  }

  if (!isObject(catalog)) return ["The dataset must be an object."];
  if (catalog.currency !== undefined && !/^[A-Z]{3}$/.test(catalog.currency)) {
    fail("currency", "must be a currency code, like USD");
  }
  if (
    catalog.sizes !== undefined &&
    !(isList(catalog.sizes) && catalog.sizes.every(isText))
  ) {
    fail("sizes", "must be a list of sizes");
  }

  const handles = new Set();
  if (!isList(catalog.products) || catalog.products.length === 0) {
    fail("products", "must list at least one product");
  }
  for (const [i, product] of (catalog.products ?? []).entries()) {
    const at = `products[${i}]`;
    if (!isObject(product)) {
      fail(at, "must be an object");
      continue;
    }
    if (!HANDLE.test(product.handle ?? "")) {
      fail(`${at}.handle`, "must be lowercase letters and digits, joined by -");
    } else if (handles.has(product.handle)) {
      fail(`${at}.handle`, `repeats ${product.handle}`);
    } else handles.add(product.handle);
    if (!isText(product.title)) fail(`${at}.title`, "is required");
    if (!isAmount(product.price)) {
      fail(`${at}.price`, 'must be an amount, like "28.00"');
    }
    if (product.compareAtPrice !== undefined) {
      if (!isAmount(product.compareAtPrice)) {
        fail(`${at}.compareAtPrice`, 'must be an amount, like "35.00"');
      } else if (Number(product.compareAtPrice) <= Number(product.price)) {
        fail(`${at}.compareAtPrice`, "must be more than the price");
      }
    }
    for (const key of ["type", "description"]) {
      if (product[key] !== undefined && typeof product[key] !== "string") {
        fail(`${at}.${key}`, "must be text");
      }
    }
    if (
      product.details !== undefined &&
      !(isList(product.details) && product.details.every(isText))
    ) {
      fail(`${at}.details`, "must be a list of lines");
    }
    const sizes = product.sizes;
    if (
      sizes !== undefined &&
      !(
        isList(sizes) &&
        sizes.length > 0 &&
        sizes.every(isText) &&
        new Set(sizes).size === sizes.length
      )
    ) {
      fail(`${at}.sizes`, "must be a list of different sizes");
    }
    const stock = product.stock;
    if (stock !== undefined && !isUnits(stock)) {
      if (!isObject(stock) || !isList(sizes)) {
        fail(`${at}.stock`, "must be units, or units per size");
      } else {
        for (const [size, units] of Object.entries(stock)) {
          if (!sizes.includes(size)) fail(`${at}.stock`, `has no size ${size}`);
          if (!isUnits(units)) fail(`${at}.stock.${size}`, "must be units");
        }
      }
    }
    for (const key of ["soldOut", "new"]) {
      if (product[key] !== undefined && typeof product[key] !== "boolean") {
        fail(`${at}.${key}`, "must be true or false");
      }
    }
    if (product.images !== undefined && !isList(product.images)) {
      fail(`${at}.images`, "must be a list");
    }
    for (const [j, entry] of (product.images ?? []).entries()) {
      image(entry, `${at}.images[${j}]`);
    }
  }

  const known = (list, at) => {
    if (!isList(list)) return fail(at, "must be a list of product handles");
    for (const handle of list) {
      if (!handles.has(handle)) fail(at, `has no product ${handle}`);
    }
  };

  const collections = new Set();
  if (catalog.collections !== undefined && !isList(catalog.collections)) {
    fail("collections", "must be a list");
  }
  for (const [i, collection] of (catalog.collections ?? []).entries()) {
    const at = `collections[${i}]`;
    if (!isObject(collection)) {
      fail(at, "must be an object");
      continue;
    }
    if (!HANDLE.test(collection.handle ?? "")) {
      fail(`${at}.handle`, "must be lowercase letters and digits, joined by -");
    } else if (collections.has(collection.handle)) {
      fail(`${at}.handle`, `repeats ${collection.handle}`);
    } else collections.add(collection.handle);
    if (!isText(collection.title)) fail(`${at}.title`, "is required");
    if (
      collection.description !== undefined &&
      typeof collection.description !== "string"
    ) {
      fail(`${at}.description`, "must be text");
    }
    known(collection.products, `${at}.products`);
    if (collection.image !== undefined) image(collection.image, `${at}.image`);
  }

  // Shopify's menus go three levels deep.
  function menuItems(items, at, depth) {
    if (!isList(items)) return fail(at, "must be a list");
    for (const [i, item] of items.entries()) {
      const here = `${at}[${i}]`;
      if (!isObject(item)) {
        fail(here, "must be an object");
        continue;
      }
      if (!isText(item.title)) fail(`${here}.title`, "is required");
      if (
        item.url != null &&
        !(
          typeof item.url === "string" &&
          (/^\/(?![/\\])/.test(item.url) || /^https?:\/\//.test(item.url))
        )
      ) {
        fail(`${here}.url`, "must be a path on the site or an http(s) URL");
      }
      if (item.items === undefined) continue;
      if (depth === 3)
        fail(`${here}.items`, "go deeper than Shopify's three levels");
      else menuItems(item.items, `${here}.items`, depth + 1);
    }
  }
  if (catalog.menus !== undefined && !isObject(catalog.menus)) {
    fail("menus", "must map each menu's handle to its items");
  }
  for (const [handle, items] of Object.entries(catalog.menus ?? {})) {
    if (!HANDLE.test(handle)) fail(`menus.${handle}`, "isn't a menu handle");
    menuItems(items, `menus.${handle}`, 1);
  }

  if (
    catalog.recommendations !== undefined &&
    !isObject(catalog.recommendations)
  ) {
    fail("recommendations", "must map product handles to recommendations");
  }
  for (const [handle, picks] of Object.entries(catalog.recommendations ?? {})) {
    const at = `recommendations.${handle}`;
    if (!handles.has(handle)) fail(at, "isn't a product");
    if (!isObject(picks)) {
      fail(at, "must be { related, complementary }");
      continue;
    }
    for (const [intent, list] of Object.entries(picks)) {
      if (intent !== "related" && intent !== "complementary") {
        fail(`${at}.${intent}`, "isn't related or complementary");
      } else known(list, `${at}.${intent}`);
    }
  }

  if (catalog.policies !== undefined && !isObject(catalog.policies)) {
    fail("policies", "must be an object");
  }
  for (const [key, text] of Object.entries(catalog.policies ?? {})) {
    if (!POLICIES[key]) {
      fail(
        `policies.${key}`,
        `isn't one of ${Object.keys(POLICIES).join(", ")}`,
      );
    } else if (!isText(text)) fail(`policies.${key}`, "must be text");
  }
  return problems;
}

// A product's variants as the store holds them: one per size, or Shopify's
// one default variant, each with its units in stock and SKU.
export function variantsOf(product) {
  const sizes = product.sizes ?? null;
  const optionName = sizes ? "Size" : "Title";
  return (sizes ?? [DEFAULT_TITLE]).map((value) => ({
    optionName,
    value,
    units: product.soldOut
      ? 0
      : typeof product.stock === "number"
        ? product.stock
        : (product.stock?.[value] ?? DEFAULT_STOCK),
    sku: (sizes ? `${product.handle}-${value}` : product.handle)
      .replace(/\s+/g, "-")
      .toUpperCase(),
  }));
}

export function descriptionHtml(product) {
  const parts = [];
  if (product.description) {
    parts.push(`<p>${escapeHtml(product.description)}</p>`);
  }
  if (product.details?.length) {
    const lines = product.details.map((line) => `<li>${escapeHtml(line)}</li>`);
    parts.push(`<ul>${lines.join("")}</ul>`);
  }
  return parts.join("");
}

// A policy's text, a paragraph per line.
export const policyHtml = (text) =>
  text
    .split(/\n+/)
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

export const collectionHtml = (collection) =>
  collection.description ? `<p>${escapeHtml(collection.description)}</p>` : "";

// Shopify's encoded variant strings (v1_) for one option: the indexes of
// the values that exist, or are available, as ranges ("0-2,4").
function encodeIndexes(indexes) {
  const ranges = [];
  for (const index of indexes) {
    const last = ranges.at(-1);
    if (last && index === last[1] + 1) last[1] = index;
    else ranges.push([index, index]);
  }
  return `v1_${ranges.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(",")}`;
}

// Stable made-up ids, numbered from the catalog's order.
const gid = (type, n) => `gid://shopify/${type}/${9000000000000 + n}`;

// Amounts as Shopify writes them: "28.0", "19.99".
const decimal = (amount) => {
  const value = Number(amount);
  return Number.isInteger(value) ? value.toFixed(1) : String(value);
};

// catalog: a parsed dataset. template(name): a recorded fixture's data (a
// copy), for shapes. imagesUrl: where the images are served (without it,
// image slots are empty). Returns the responses by fixture name, each
// variant's units, each product's card, and the filters for a set of
// products (search's).
export function buildDataset(
  catalog,
  template,
  { imagesUrl, now = new Date() } = {},
) {
  const currencyCode = catalog.currency ?? "USD";
  const money = (amount) => ({ amount: decimal(amount), currencyCode });
  const fixtures = new Map();
  const stock = new Map();
  const imageOf = (entry, alt) =>
    entry && imagesUrl
      ? {
          url: `${imagesUrl}${imagePath(entry)}`,
          altText: entry.alt ?? alt,
          width: entry.width,
          height: entry.height,
        }
      : null;
  const yesterday = new Date(now.getTime() - DAY)
    .toISOString()
    .replace(/\.\d+Z$/, "Z");

  const recorded = template("ProductContent.test-tee-3-option").product;
  const products = catalog.products.map((product, index) => {
    const n = (index + 1) * 100;
    const options = variantsOf(product);
    const images = (product.images ?? [])
      .map((entry) => imageOf(entry, product.title))
      .filter(Boolean);
    const variants = options.map((option, i) => {
      const variant = {
        id: gid("ProductVariant", n + i),
        title: option.value,
        sku: option.sku,
        barcode: null,
        availableForSale: option.units > 0,
        price: money(product.price),
        compareAtPrice: product.compareAtPrice
          ? money(product.compareAtPrice)
          : null,
        sellingPlanAllocations: { nodes: [] },
        selectedOptions: [{ name: option.optionName, value: option.value }],
        image: images[0] ? { url: images[0].url } : null,
      };
      stock.set(variant.id, option.units);
      return variant;
    });
    const available = variants.flatMap((v, i) =>
      v.availableForSale ? [i] : [],
    );
    // Shopify's first available variant, or the first when none is.
    const first = variants[available[0] ?? 0];
    const content = {
      ...recorded,
      id: gid("Product", n),
      isGiftCard: false,
      handle: product.handle,
      title: product.title,
      vendor: "",
      productType: product.type ?? "",
      description: [product.description, ...(product.details ?? [])]
        .filter(Boolean)
        .join(" "),
      descriptionHtml: descriptionHtml(product),
      options: [
        {
          name: options[0].optionName,
          optionValues: options.map(({ value }) => ({
            name: value,
            swatch: null,
          })),
        },
      ],
      media: {
        nodes: images.map((image) => ({
          __typename: "MediaImage",
          alt: image.altText,
          previewImage: image,
          image,
        })),
      },
      seo: { title: null, description: null },
      requiresSellingPlan: false,
      variants: { nodes: variants },
      sellingPlanGroups: { nodes: [] },
      reviewRating: null,
      reviewCount: null,
      publishedAt: product.new ? yesterday : PUBLISHED_AT,
      merchantBadges: null,
      encodedVariantExistence: encodeIndexes(variants.map((_, i) => i)),
      encodedVariantAvailability: available.length
        ? encodeIndexes(available)
        : "v1_",
      selectedOrFirstAvailableVariant: {
        ...recorded.selectedOrFirstAvailableVariant,
        id: first.id,
        title: first.title,
        sku: first.sku,
        availableForSale: first.availableForSale,
        quantityAvailable: stock.get(first.id),
        // Only for a variant sold while out of stock (backorders).
        currentlyNotInStock: false,
        selectedOptions: first.selectedOptions,
        price: first.price,
        compareAtPrice: first.compareAtPrice,
        sellingPlanAllocations: { nodes: [] },
      },
    };
    fixtures.set(`ProductContent.${product.handle}`, { product: content });
    return { product, content, variants };
  });
  const byHandle = new Map(products.map((p) => [p.product.handle, p]));

  // The listing card, as collections, search and recommendations send it.
  const cardOf = ({ content, variants }) => {
    const prices = variants.map((v) => Number(v.price.amount));
    return {
      id: content.id,
      handle: content.handle,
      title: content.title,
      availableForSale: variants.some((v) => v.availableForSale),
      trackingParameters: null,
      featuredImage: content.media.nodes[0]?.image ?? null,
      priceRange: {
        minVariantPrice: money(Math.min(...prices)),
        maxVariantPrice: money(Math.max(...prices)),
      },
      reviewRating: null,
      reviewCount: null,
      publishedAt: content.publishedAt,
      merchantBadges: null,
      requiresSellingPlan: false,
      isGiftCard: false,
      variants: {
        pageInfo: { hasNextPage: variants.length > 10 },
        nodes: variants.slice(0, 10).map((v) => ({
          id: v.id,
          availableForSale: v.availableForSale,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          sellingPlanAllocations: { nodes: [] },
        })),
      },
    };
  };
  const cards = new Map(products.map((p) => [p.product.handle, cardOf(p)]));

  // Search & Discovery's filters for a set of products (availability,
  // price and size), with counts, as Shopify reports them.
  const filtersOf = (members) => {
    const available = members.filter((m) =>
      m.variants.some((v) => v.availableForSale),
    ).length;
    const max = Math.max(0, ...members.map((m) => Number(m.product.price)));
    const order = catalog.sizes ?? [];
    const rank = (size) =>
      order.includes(size) ? order.indexOf(size) : order.length;
    const sizes = [...new Set(members.flatMap((m) => m.product.sizes ?? []))]
      .map((size, i) => ({ size, i }))
      .sort((a, b) => rank(a.size) - rank(b.size) || a.i - b.i)
      .map(({ size }) => size);
    return [
      {
        id: "filter.v.availability",
        label: "Availability",
        type: "LIST",
        values: [
          {
            id: "filter.v.availability.1",
            label: "In stock",
            count: available,
            input: JSON.stringify({ available: true }),
          },
          {
            id: "filter.v.availability.0",
            label: "Out of stock",
            count: members.length - available,
            input: JSON.stringify({ available: false }),
          },
        ],
      },
      {
        id: "filter.v.price",
        label: "Price",
        type: "PRICE_RANGE",
        values: [
          {
            id: "filter.v.price",
            label: "Price",
            count: 0,
            input: JSON.stringify({ price: { min: 0, max } }),
          },
        ],
      },
      ...(sizes.length
        ? [
            {
              id: "filter.v.option.size",
              label: "Size",
              type: "LIST",
              values: sizes.map((size) => ({
                id: `filter.v.option.size.${size.toLowerCase().replace(/\s+/g, "-")}`,
                label: size,
                count: members.filter((m) => m.product.sizes?.includes(size))
                  .length,
                input: JSON.stringify({
                  variantOption: { name: "size", value: size },
                }),
              })),
            },
          ]
        : []),
    ];
  };

  // Collections. /collections/all lists every product without one (the
  // site's fallback), as on a store that hasn't made an "all" collection.
  const collections = catalog.collections ?? [];
  collections.forEach((collection, index) => {
    const members = collection.products.map((handle) => byHandle.get(handle));
    const listing = template("CollectionListing.test-apparel");
    listing.collection = {
      ...listing.collection,
      id: gid("Collection", (index + 1) * 10),
      handle: collection.handle,
      title: collection.title,
      description: collection.description ?? "",
      descriptionHtml: collectionHtml(collection),
      image: imageOf(collection.image, collection.title),
      seo: { title: null, description: null },
      products: {
        ...listing.collection.products,
        nodes: members.map(cardOf),
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        filters: filtersOf(members),
      },
    };
    fixtures.set(`CollectionListing.${collection.handle}`, listing);
  });

  // Menus as Shopify sends them. A link to one of the dataset's collections
  // is a COLLECTION item; any other link is typed in (HTTP), on the store's
  // domain for the site's own paths. A heading is typed as "#", which
  // Shopify sends back as the store's root with "#". The third level has no
  // items field (the query stops there).
  const collectionHandles = new Set(collections.map((c) => c.handle));
  const menuItems = (items, depth) =>
    items.map((item) => {
      const handle = item.url?.match(/^\/collections\/([^/?#]+)$/)?.[1];
      const collection = handle && collectionHandles.has(handle);
      return {
        title: item.title,
        type: collection ? "COLLECTION" : "HTTP",
        url: !item.url
          ? `${ORIGIN}#`
          : item.url.startsWith("/")
            ? `${ORIGIN}${item.url}`
            : item.url,
        resource: collection ? { __typename: "Collection", handle } : null,
        ...(depth < 3 ? { items: menuItems(item.items ?? [], depth + 1) } : {}),
      };
    });
  for (const [handle, items] of Object.entries(catalog.menus ?? {})) {
    const menu = template("Menu.footer");
    menu.menu = { items: menuItems(items, 1) };
    fixtures.set(`Menu.${handle}`, menu);
  }

  // Shopify's RELATED ("You may also like") and COMPLEMENTARY ("Pairs well
  // with") recommendations.
  for (const [handle, picks] of Object.entries(catalog.recommendations ?? {})) {
    for (const intent of ["related", "complementary"]) {
      fixtures.set(`ProductRecommendations.${handle}.${intent}`, {
        productRecommendations: (picks[intent] ?? []).map((pick) =>
          cards.get(pick),
        ),
      });
    }
  }

  // The dataset's policies, and no others: Shopify sends null for a policy
  // the store hasn't written.
  const policies = template("ShopPolicies");
  for (const field of Object.keys(policies.shop)) policies.shop[field] = null;
  for (const [key, text] of Object.entries(catalog.policies ?? {})) {
    const { field, handle, title } = POLICIES[key];
    policies.shop[field] = { handle, title, body: policyHtml(text) };
  }
  fixtures.set("ShopPolicies", policies);

  return {
    fixtures,
    stock,
    cards,
    filters: (handles) =>
      filtersOf(handles.map((handle) => byHandle.get(handle))),
  };
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
