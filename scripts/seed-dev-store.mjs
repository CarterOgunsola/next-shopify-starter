// Copies a dataset (e2e/support/datasets/<name>.json, the catalog `pnpm
// dev:synthetic` shows) into a Shopify dev store through the Admin API, so
// the real store shows the same thing: products with their images, sizes,
// prices and stock, the collections and menus, all published to the
// Headless channel (and the Online Store, since Shopify's search only
// covers what's there), the recommendations and the policies. Placeholder
// images go up as the PNGs dev:synthetic draws. Safe to run again:
// everything is matched by handle and updated.
//
// Development stores only: it overwrites menus and policies. It needs
// Search & Discovery installed (for the recommendations) and automated
// policies turned off (Settings > Policies).
//
//   shopify store auth -s <store> --scopes write_products,write_publications,
//     write_online_store_navigation,write_files,write_inventory,read_locations,
//     write_legal_policies
//   pnpm seed:dev-store <store>.myshopify.com [dataset]

import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  collectionHtml,
  descriptionHtml,
  imagesFolder,
  POLICIES,
  policyHtml,
  readDataset,
  variantsOf,
} from "../e2e/support/dataset.mjs";
import { imageBytes, imagePath, mimeType } from "../e2e/support/images.mjs";

const USAGE = "Usage: pnpm seed:dev-store <store>.myshopify.com [dataset]";
const STORE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

// { store, dataset } or { error }.
export function parseArgs(args) {
  const [store, dataset = "sample", ...rest] = args;
  if (!store || rest.length) return { error: USAGE };
  if (!STORE.test(store)) {
    return { error: `${store} isn't a *.myshopify.com domain.\n${USAGE}` };
  }
  return { store, dataset };
}

// Every image the dataset uses, once, with the name and type it's uploaded
// under. key: where dev:synthetic serves it (images.mjs).
export function imagesOf(catalog) {
  const entries = [
    ...catalog.products.flatMap((product) => product.images ?? []),
    ...(catalog.collections ?? []).flatMap((c) => (c.image ? [c.image] : [])),
  ];
  const images = new Map();
  for (const entry of entries) {
    const key = imagePath(entry);
    if (images.has(key)) continue;
    images.set(key, {
      key,
      entry,
      filename:
        entry.file ??
        `placeholder-${entry.color.slice(1).toLowerCase()}-${entry.width}x${entry.height}.png`,
      mimeType: entry.file ? mimeType(entry.file) : "image/png",
    });
  }
  return [...images.values()];
}

// productSet's input. locationId: where the stock is; staged: an image's
// key -> its uploaded URL.
export function productSetInput(product, { locationId, staged }) {
  const variants = variantsOf(product);
  const optionName = variants[0].optionName;
  return {
    handle: product.handle,
    title: product.title,
    descriptionHtml: descriptionHtml(product),
    productType: product.type ?? "",
    status: "ACTIVE",
    productOptions: [
      {
        name: optionName,
        position: 1,
        values: variants.map(({ value }) => ({ name: value })),
      },
    ],
    variants: variants.map((variant) => ({
      optionValues: [{ optionName, name: variant.value }],
      price: product.price,
      compareAtPrice: product.compareAtPrice ?? null,
      inventoryPolicy: "DENY",
      inventoryItem: { tracked: true, sku: variant.sku },
      inventoryQuantities: [
        { locationId, name: "available", quantity: variant.units },
      ],
    })),
    files: (product.images ?? []).map((entry) => ({
      originalSource: staged.get(imagePath(entry)),
      contentType: "IMAGE",
      alt: entry.alt ?? product.title,
    })),
  };
}

// collectionCreate's or collectionUpdate's input. imageSrc: the hosted URL
// of its image, if it has one.
export function collectionInput(collection, { imageSrc } = {}) {
  return {
    handle: collection.handle,
    title: collection.title,
    descriptionHtml: collectionHtml(collection),
    sortOrder: "MANUAL",
    ...(imageSrc && {
      image: {
        src: imageSrc,
        altText: collection.image?.alt ?? collection.title,
      },
    }),
  };
}

// A menu's items for menuCreate and menuUpdate. A link to one of the
// dataset's collections is a COLLECTION item; any other is typed in
// (HTTP), on the store's own domain for the site's paths, which the site
// reads back as paths. A heading is typed as "#": Shopify won't save an
// item without a link. collectionIds: handle -> id.
export function menuItemsInput(items, { store, collectionIds }) {
  return items.map((item) => {
    const handle = item.url?.match(/^\/collections\/([^/?#]+)$/)?.[1];
    const collectionId = handle && collectionIds.get(handle);
    return {
      title: item.title,
      ...(collectionId
        ? { type: "COLLECTION", resourceId: collectionId }
        : {
            type: "HTTP",
            url: !item.url
              ? "#"
              : item.url.startsWith("/")
                ? `https://${store}${item.url}`
                : item.url,
          }),
      items: menuItemsInput(item.items ?? [], { store, collectionIds }),
    };
  });
}

// "main-menu" -> "Main menu".
export const menuTitle = (handle) =>
  handle.replace(/-/g, " ").replace(/^./, (first) => first.toUpperCase());

// Search & Discovery keeps the products picked for a product's
// recommendations in these metafields (the app has to be installed).
const RECOMMENDATIONS = {
  related: "related_products",
  complementary: "complementary_products",
};

// metafieldsSet's input for the recommendations. productIds: handle -> id.
export function recommendationMetafields(catalog, productIds) {
  return Object.entries(catalog.recommendations ?? {}).flatMap(
    ([handle, picks]) =>
      Object.entries(RECOMMENDATIONS).flatMap(([intent, key]) =>
        picks[intent]
          ? [
              {
                ownerId: productIds.get(handle),
                namespace: "shopify--discovery--product_recommendation",
                key,
                type: "list.product_reference",
                value: JSON.stringify(
                  picks[intent].map((pick) => productIds.get(pick)),
                ),
              },
            ]
          : [],
      ),
  );
}

// shopPolicyUpdate's input for each of the dataset's policies.
export const policyInputs = (catalog) =>
  Object.entries(catalog.policies ?? {}).map(([key, text]) => ({
    type: POLICIES[key].type,
    body: policyHtml(text),
  }));

// --- Running it ----------------------------------------------------------

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.error) {
    console.error(options.error);
    process.exit(2);
  }
  const { store } = options;
  const catalog = readDataset(options.dataset);
  const folder = imagesFolder(options.dataset);

  // Through the Shopify CLI, signed in with `shopify store auth`.
  function admin(query, variables = {}) {
    const output = execFileSync(
      "shopify",
      [
        "store",
        "execute",
        "-s",
        store,
        "-j",
        "--no-input",
        "--allow-mutations",
        "-q",
        query,
        "-v",
        JSON.stringify(variables),
      ],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 1 << 26,
      },
    );
    // Progress events come first, one per line; the result is the JSON after.
    return JSON.parse(output.slice(output.indexOf("\n{") + 1));
  }

  // Mutations report problems in userErrors rather than failing.
  function check(payload, what) {
    const errors = payload.userErrors ?? [];
    if (errors.length) {
      throw new Error(
        `${what}: ${errors.map((e) => `${e.field ?? ""} ${e.message}`).join("; ")}`,
      );
    }
    return payload;
  }

  // --- The store ---

  const { locations, publications, shop } = admin(`{
    shop { primaryDomain { url } plan { partnerDevelopment } }
    locations(first: 1) { nodes { id } }
    publications(first: 20) { nodes { id name } }
  }`);
  if (!shop.plan.partnerDevelopment) {
    throw new Error(
      `${store} isn't a development store; this script only seeds those.`,
    );
  }
  const locationId = locations.nodes[0].id;
  const headless = publications.nodes.find((p) => /headless/i.test(p.name));
  if (!headless) {
    throw new Error("No Headless channel publication on this store.");
  }
  // Shopify's search only returns what's also on the Online Store, even
  // through the Headless channel's token.
  const onlineStore = publications.nodes.find((p) => p.name === "Online Store");

  // --- Images ---

  // Uploads to Shopify's staging bucket; image key -> resourceUrl, which
  // productSet and fileCreate take as a source.
  const images = await Promise.all(
    imagesOf(catalog).map(async (image) => ({
      ...image,
      body: (await imageBytes(image.entry, folder)).body,
    })),
  );
  console.log(`Uploading ${images.length} images…`);
  const { stagedUploadsCreate } = admin(
    `mutation ($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: images.map((image) => ({
        filename: image.filename,
        mimeType: image.mimeType,
        resource: "IMAGE",
        httpMethod: "POST",
        fileSize: String(image.body.length),
      })),
    },
  );
  check(stagedUploadsCreate, "stagedUploadsCreate");
  const staged = new Map();
  await Promise.all(
    stagedUploadsCreate.stagedTargets.map(async (target, i) => {
      const form = new FormData();
      for (const { name, value } of target.parameters) form.append(name, value);
      form.append(
        "file",
        new Blob([images[i].body], { type: images[i].mimeType }),
        images[i].filename,
      );
      const response = await fetch(target.url, { method: "POST", body: form });
      if (!response.ok) {
        throw new Error(
          `Upload of ${images[i].filename} failed: ${response.status}`,
        );
      }
      staged.set(images[i].key, target.resourceUrl);
    }),
  );

  // --- Products ---

  const productIds = new Map();
  for (const product of catalog.products) {
    const { productSet } = admin(
      `mutation ($input: ProductSetInput!, $identifier: ProductSetIdentifiers) {
        productSet(input: $input, identifier: $identifier, synchronous: true) {
          product { id }
          userErrors { field message }
        }
      }`,
      {
        input: productSetInput(product, { locationId, staged }),
        identifier: { handle: product.handle },
      },
    );
    check(productSet, `productSet ${product.handle}`);
    productIds.set(product.handle, productSet.product.id);
    console.log(`Product ${product.handle}`);
  }

  // --- Collections ---

  // A collection's image takes a public URL, so its file goes through
  // Files first and is waited on until Shopify has processed it.
  async function hostedImage(entry, alt) {
    const { fileCreate } = admin(
      `mutation ($files: [FileCreateInput!]!) {
        fileCreate(files: $files) { files { id } userErrors { field message } }
      }`,
      {
        files: [
          {
            originalSource: staged.get(imagePath(entry)),
            contentType: "IMAGE",
            alt,
          },
        ],
      },
    );
    const { id } = check(fileCreate, "fileCreate").files[0];
    for (let attempt = 0; attempt < 30; attempt++) {
      const { node } = admin(
        `query ($id: ID!) { node(id: $id) { ... on MediaImage { fileStatus image { url } } } }`,
        { id },
      );
      if (node.fileStatus === "READY") return node.image.url;
      if (node.fileStatus === "FAILED") {
        throw new Error(`Processing ${imagePath(entry)} failed.`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error(`Timed out waiting for ${imagePath(entry)}.`);
  }

  const collectionIds = new Map();
  for (const collection of catalog.collections ?? []) {
    const { collectionByIdentifier: found } = admin(
      `query ($handle: String!) {
        collectionByIdentifier(identifier: { handle: $handle }) {
          id products(first: 250) { nodes { id } }
        }
      }`,
      { handle: collection.handle },
    );
    const input = collectionInput(collection, {
      imageSrc:
        collection.image &&
        (await hostedImage(
          collection.image,
          collection.image.alt ?? collection.title,
        )),
    });
    const members = collection.products.map((handle) => productIds.get(handle));

    let id;
    if (found) {
      const { collectionUpdate } = admin(
        `mutation ($input: CollectionInput!) {
          collectionUpdate(input: $input) { collection { id } userErrors { field message } }
        }`,
        { input: { ...input, id: found.id } },
      );
      id = check(collectionUpdate, `collectionUpdate ${collection.handle}`)
        .collection.id;
      const stale = found.products.nodes.map((p) => p.id);
      if (stale.length) {
        check(
          admin(
            `mutation ($id: ID!, $productIds: [ID!]!) {
              collectionRemoveProducts(id: $id, productIds: $productIds) { userErrors { field message } }
            }`,
            { id, productIds: stale },
          ).collectionRemoveProducts,
          `collectionRemoveProducts ${collection.handle}`,
        );
      }
      if (members.length) {
        check(
          admin(
            `mutation ($id: ID!, $productIds: [ID!]!) {
              collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
            }`,
            { id, productIds: members },
          ).collectionAddProducts,
          `collectionAddProducts ${collection.handle}`,
        );
      }
    } else {
      const { collectionCreate } = admin(
        `mutation ($input: CollectionInput!) {
          collectionCreate(input: $input) { collection { id handle } userErrors { field message } }
        }`,
        { input: { ...input, products: members } },
      );
      const created = check(
        collectionCreate,
        `collectionCreate ${collection.handle}`,
      ).collection;
      if (created.handle !== collection.handle) {
        console.warn(
          `Collection ${collection.handle} was given the handle ${created.handle}.`,
        );
      }
      id = created.id;
    }
    collectionIds.set(collection.handle, id);
    console.log(`Collection ${collection.handle}`);
  }

  // --- Publishing ---

  for (const id of [...productIds.values(), ...collectionIds.values()]) {
    check(
      admin(
        `mutation ($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        {
          id,
          input: [headless, onlineStore]
            .filter(Boolean)
            .map((publication) => ({ publicationId: publication.id })),
        },
      ).publishablePublish,
      `publishablePublish ${id}`,
    );
  }
  console.log(
    `Published ${productIds.size} products and ${collectionIds.size} collections.`,
  );

  // --- Menus ---

  const { menus } = admin(`{ menus(first: 50) { nodes { id handle } } }`);
  const menuIds = new Map(menus.nodes.map((menu) => [menu.handle, menu.id]));
  for (const [handle, items] of Object.entries(catalog.menus ?? {})) {
    const variables = {
      title: menuTitle(handle),
      handle,
      items: menuItemsInput(items, { store, collectionIds }),
    };
    const id = menuIds.get(handle);
    if (id) {
      check(
        admin(
          `mutation ($id: ID!, $title: String!, $handle: String, $items: [MenuItemUpdateInput!]!) {
            menuUpdate(id: $id, title: $title, handle: $handle, items: $items) { userErrors { field message } }
          }`,
          { ...variables, id },
        ).menuUpdate,
        `menuUpdate ${handle}`,
      );
    } else {
      check(
        admin(
          `mutation ($title: String!, $handle: String!, $items: [MenuItemCreateInput!]!) {
            menuCreate(title: $title, handle: $handle, items: $items) { userErrors { field message } }
          }`,
          variables,
        ).menuCreate,
        `menuCreate ${handle}`,
      );
    }
    console.log(`Menu ${handle}`);
  }

  // --- Recommendations ---

  const metafields = recommendationMetafields(catalog, productIds);
  // metafieldsSet takes 25 at a time.
  for (let i = 0; i < metafields.length; i += 25) {
    check(
      admin(
        `mutation ($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) { userErrors { field message } }
        }`,
        { metafields: metafields.slice(i, i + 25) },
      ).metafieldsSet,
      "metafieldsSet recommendations",
    );
  }
  if (metafields.length)
    console.log(`Set ${metafields.length} recommendations`);

  // --- Policies ---

  for (const shopPolicy of policyInputs(catalog)) {
    check(
      admin(
        `mutation ($shopPolicy: ShopPolicyInput!) {
          shopPolicyUpdate(shopPolicy: $shopPolicy) { userErrors { field message } }
        }`,
        { shopPolicy },
      ).shopPolicyUpdate,
      `shopPolicyUpdate ${shopPolicy.type}`,
    );
    console.log(`Policy ${shopPolicy.type}`);
  }

  console.log(`Done: ${shop.primaryDomain.url}`);
}

if (realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
