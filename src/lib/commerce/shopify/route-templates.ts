import { createShopifyRouteTemplates } from "@shopify/hydrogen";

// Where Shopify's standard URLs live on this site, for Hydrogen's redirects
// and Shopify's scripts. Products only have /products/<handle>, including
// Shopify's collection-scoped product URLs.
export const routeTemplates = createShopifyRouteTemplates({
  productInCollection: "/products/:productHandle",
});
