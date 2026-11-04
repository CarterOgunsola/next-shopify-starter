# Architecture

## Module boundaries

- `src/lib/commerce/` is the only code that talks to Shopify. Pages and components import domain types from `@/lib/commerce` and server functions from its `*.server` modules. `@shopify/*` imports are allowed only inside `src/lib/commerce/shopify/`, which is private to `src/lib/commerce`. See [`src/lib/commerce/README.md`](../src/lib/commerce/README.md).
- `src/lib/content/` is the extension point for a CMS, and the only code allowed to import a CMS SDK (the `cms` group in `eslint.config.mjs`). Nothing is connected yet: it returns no pages. To add a CMS, implement `content` in `src/lib/content/index.ts`, extend its types, add routes that call it, and list those routes in `src/lib/commerce/app-routes.ts`.
- `src/lib/consent/` gates every non-essential script. Only it imports the consent vendor.
- `src/lib/brand.ts` holds the store's names and `src/lib/cookie-names.ts` names every first-party cookie. Nothing else hard-codes either; `src/lib/brand.test.ts` fails if a configured store name appears anywhere else in the repo.

ESLint enforces the boundaries, plus two server/client rules: `*.server` modules must import `server-only`, and `"use client"` files can't import them.

## Caching rules

- Every function in `src/lib/commerce/catalog.server.ts` that calls Shopify has `"use cache"` (or `"use cache: remote"`) and cache tags, and every export takes a `PublicContext`, so a signed-in buyer can never reach a shared cache. `caching.test.ts` and the type checker enforce this.
- Nothing buyer-specific is cached: variant price and stock (`pricing.server.ts`), the cart, search, accounts and the `/api/commerce` endpoints read per request. A few endpoints that hold no buyer data are shared-cached for minutes.
- Shopify operations (`src/lib/commerce/shopify/operations`) never cache. ESLint refuses `"use cache"` and `next/cache` there.
- Webhooks (`/api/webhooks/shopify`) expire the tags for products, collections, metaobjects and the shop. Menus and policies have no webhook and refresh hourly; `POST /api/revalidate/menus` refreshes menus at once.

## Search engines

The whole site stays out of search until launch (`SITE_INDEXED`). Until then every response carries `X-Robots-Tag: noindex, nofollow`, set for every path in `next.config.ts` (`src/lib/indexing.ts`), so pages, route handlers, error pages and static files all say it. Every page's robots meta tag says the same. `robots.txt` still allows crawling, so crawlers can see the noindex, but lists no sitemap, and `/sitemap.xml` and the shop sitemaps 404. `SHOP_INDEXED` only takes effect once `SITE_INDEXED` is on. The flag is read at build, so turning it on needs a redeploy. On Cloudflare, static files skip `next.config.ts`, so `scripts/cloudflare-assets.mjs` copies the header into their `_headers` (see [Deploying to Cloudflare](deploy-cloudflare.md)).

## Regulatory wording

All regulatory wording lives in `src/lib/commerce/compliance.ts` (the marketing opt-in, subscription terms and review incentive disclosure) and ships as placeholders (`approved: false`): pages show it with a visible `[Placeholder, pending legal review]` marker until counsel approves each entry, and `pnpm launch:check` fails until then.
