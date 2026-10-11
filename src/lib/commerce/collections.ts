import type { Collection } from "./types";

// /collections/all, Shopify's conventional "every product" page, when the
// store has no collection with that handle.
export const ALL_PRODUCTS: Collection = {
  id: "all",
  handle: "all",
  title: "All products",
  descriptionHtml: "",
  image: null,
  seo: { title: "All products", description: "" },
};
