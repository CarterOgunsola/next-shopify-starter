# Launch checklist

The site can launch first, as a content site with the shop off, and the shop later; for a launch with both, work through both lists. Every variable is described in [Environment](environment.md). Host differences are in [Deploying to Cloudflare](deploy-cloudflare.md).

## Site launch

- [ ] Replace the placeholder pages and copy: the home page, `/privacy`, `/terms`, `/cookies`, `/privacy-choices` and the consent banner.
- [ ] Counsel confirms the consent policy (`src/lib/consent/policy.ts`: which regions get the opt-out or opt-in model, and what Global Privacy Control turns off).
- [ ] The production domain is added to the project on your host (a domain on the Vercel project, or a custom domain on the Worker).
- [ ] `NEXT_PUBLIC_SITE_URL` is the production domain (`https://`, no trailing slash). Metadata, canonical URLs, `robots.txt` and the sitemaps are built from it.
- [ ] `SITE_INDEXED=true` once the site should be indexed. Until then every response says `noindex, nofollow` and the sitemaps 404. After it, `https://<domain>/robots.txt` lists the sitemap, and pages no longer send `X-Robots-Tag`.
- [ ] `SHOP_ENABLED` matches what's launching. With it off, the shop pages 404.
- [ ] The variables of the vendors you use are set for production: `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_KLAVIYO_SITE_ID`, `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_LIST_ID`, `NEXT_PUBLIC_ATTENTIVE_BRAND` and `JUDGEME_PRIVATE_TOKEN`. A vendor stays off without its variables.
- [ ] With GTM, every non-Google tag in the container requires `ad_storage` (marketing consent), not just `analytics_storage`: the container itself loads with analytics consent.
- [ ] A WAF rate-limit rule (Vercel WAF, or Cloudflare's rate limiting rules) covers the newsletter sign-up (the footer form's server action).
- [ ] Content Security Policy reports from production are reviewed, and the vendor allowlists in `src/lib/security/headers.ts` are confirmed against them (see [Security](security.md)).

## Shop launch

- [ ] The production store's Headless channel values are set: `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_PRIVATE_ACCESS_TOKEN`, `NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN` and `SHOPIFY_STOREFRONT_ID`.
- [ ] Shopify admin is set up for a headless store:
  - Checkout runs on a subdomain of the production domain, set as the primary domain (Online Store target), and `SHOPIFY_CHECKOUT_DOMAIN` is that subdomain.
  - Shopify's own cookie banner is off, with the consent regions kept (Settings > Customer privacy). The site's banner is the only one.
  - A redirect theme is published that sends Liquid storefront URLs to the site and leaves checkout and cart alone.
  - The storefront password is off (Online Store > Preferences). While it's on, checkout redirects to `/password`. `SHOPIFY_STOREFRONT_PASSWORD` is removed from the production variables.
- [ ] Counsel approves every entry in `src/lib/commerce/compliance.ts`, so `pnpm launch:check` passes.
- [ ] `SHOP_ENABLED=true`.
- [ ] `SHOP_INDEXED=true` once the shop should be indexed. It needs `SITE_INDEXED`. The shop sitemaps, `robots.txt`, the Markdown pages and `/llms.txt` follow.
- [ ] Webhooks are registered, with `SHOPIFY_WEBHOOK_SECRET` set: Admin API `webhookSubscriptionCreate` with `uri` `https://<domain>/api/webhooks/shopify` for `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `COLLECTIONS_CREATE`, `COLLECTIONS_UPDATE`, `COLLECTIONS_DELETE`, `METAOBJECTS_CREATE`, `METAOBJECTS_UPDATE`, `METAOBJECTS_DELETE` and `SHOP_UPDATE`. The route answers 404 while the shop is off, so register them after `SHOP_ENABLED`.
- [ ] `MENUS_REVALIDATE_SECRET` (32+ characters) is set, so a menu edit can be refreshed at once with `POST /api/revalidate/menus`. Without it, menus refresh hourly.
- [ ] WAF rate-limit rules (Vercel WAF, or Cloudflare's rate limiting rules) cover `/api/commerce/predictive-search`, `/api/commerce/browse`, `/api/mcp`, `/api/ucp/mcp` and `/discount/*` (each visit can create a cart).
- [ ] Customer accounts: the Headless channel's Customer Account API settings have the production callback (`https://<domain>/account/authorize`), JavaScript origin (`https://<domain>`, no port) and logout URI (`https://<domain>/`), and `SHOPIFY_CUSTOMER_CLIENT_ID` and `CUSTOMER_ACCOUNT_SESSION_SECRET` are set.
- [ ] Order notification emails link to `https://<domain>/account/orders/{{ order.id }}` if order pages should be here (Settings > Notifications).
- [ ] Production Content Security Policy reports are clean, Shop Pay works with `Cross-Origin-Opener-Policy: same-origin`, and `CSP_ENFORCE=1` is set. The build fails if `CSP_ENFORCE=1` is set without `SHOPIFY_CHECKOUT_DOMAIN`.
- [ ] With Klaviyo: catalog URLs point at `https://<domain>/products/<handle>`, the Shopify catalog sync is on, a Back in Stock flow exists, inventory stops selling when out of stock, and `KLAVIYO_PRIVATE_API_KEY` has the `catalogs:write` scope.
- [ ] Search & Discovery has a filter for each facet the collection pages should offer. Option facets such as Color and Size need product option filters.
- [ ] `NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD` matches the store's free-shipping rate, if it has one.

## Deploys

- The flags above are read at build, and both hosts apply changed variables to new deployments only, so redeploy after changing any of them. On Cloudflare, the build needs them as build variables and the running Worker as its own variables and secrets (see [Deploying to Cloudflare](deploy-cloudflare.md#environment-and-secrets)).
- With the shop on, a deploy's build fails during a Shopify outage (`Error occurred prerendering page`) while the previous deployment stays live, so redeploy once Shopify is back.
