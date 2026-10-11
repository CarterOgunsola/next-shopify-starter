# Next.js Shopify starter

A Shopify Plus ready, headless storefront starter: Next.js 16 (App Router, Cache Components and Partial Prerendering, React Compiler), React 19, TypeScript and Tailwind 4, on Shopify's Storefront API and Customer Account API through `@shopify/hydrogen` (framework-agnostic). It ships with a consent layer, security headers, optional marketing and review vendors, and unit, integration and end-to-end tests that never touch the network.

It is brand-free: the store's name, the cookie prefix and the consent policy are configuration, and pages carry neutral placeholder copy until you replace it.

## Features

- **Catalog.** `/shop`, `/collections/{handle}` (Search & Discovery filters, sort, cursor pages), `/products/{handle}` (variant selection in the URL, live price and stock, galleries, badges, recommendations), `/search` with a predictive search combobox. All at Shopify's standard paths, so Shopify-generated links work.
- **Cart and checkout.** A server-owned cart (HttpOnly cookie, server actions, optimistic UI), discount codes and `/discount/{code}` links, gift card codes and gift card recipients, subscriptions (selling plans), free-shipping progress, Buy with Shop Pay, and Shopify's hosted checkout.
- **Customer accounts.** Customer Account API sign-in (OAuth with PKCE), order history and order detail, profile and address book, and the cart linked to the customer at checkout.
- **Static where it can be.** Product and collection pages prerender per handle, with real 404s for unknown handles. Buyer-specific data (price, stock, cart) loads per request and is never cached.
- **SEO and agents.** JSON-LD, Open Graph, sitemaps from Shopify's sitemap API, `robots.txt`, Markdown versions of product pages and `/llms.txt` after launch, and Shopify's Storefront MCP and UCP endpoints.
- **Consent.** c15t in headless mode with a region model (opt-out in the US, opt-in elsewhere by default), Global Privacy Control, Google Consent Mode v2 and Shopify's Customer Privacy API.
- **Optional vendors.** Google Tag Manager and GA4, Klaviyo (sign-up form, back in stock, onsite forms), Attentive, Judge.me reviews. Each is off until its env vars are set.
- **Optional supplement module.** Supplement Facts panel, DSHEA disclaimer and Prop 65 warning, driven by product metafields and shown only for products that have them.
- **Security.** HSTS, a strict Content Security Policy (report-only until you enforce it), HttpOnly cart and session cookies, webhook HMAC checks, and a build step that fails if a server secret reaches client output.
- **Tests.** Vitest with MSW and recorded synthetic fixtures, Playwright end to end against a hermetic synthetic store, axe accessibility checks, and a Core Web Vitals budget.

## Architecture

### Module boundaries

- `src/lib/commerce/` is the only code that talks to Shopify. Pages and components import domain types from `@/lib/commerce` and server functions from its `*.server` modules. `@shopify/*` imports are allowed only inside `src/lib/commerce/shopify/`, which is private to `src/lib/commerce`. See [`src/lib/commerce/README.md`](src/lib/commerce/README.md).
- `src/lib/content/` is the extension point for a CMS, and the only code allowed to import a CMS SDK (the `cms` group in `eslint.config.mjs`). Nothing is connected yet: it returns no pages. To add a CMS, implement `content` in `src/lib/content/index.ts`, extend its types, add routes that call it, and list those routes in `src/lib/commerce/app-routes.ts`.
- `src/lib/consent/` gates every non-essential script. Only it imports the consent vendor.
- `src/lib/brand.ts` holds the store's names and `src/lib/cookie-names.ts` names every first-party cookie. Nothing else hard-codes either; `src/lib/brand.test.ts` fails if a configured store name appears anywhere else in the repo.

ESLint enforces the boundaries, plus two server/client rules: `*.server` modules must import `server-only`, and `"use client"` files can't import them.

### Caching rules

- Every function in `src/lib/commerce/catalog.server.ts` that calls Shopify has `"use cache"` (or `"use cache: remote"`) and cache tags, and every export takes a `PublicContext`, so a signed-in buyer can never reach a shared cache. `caching.test.ts` and the type checker enforce this.
- Nothing buyer-specific is cached: variant price and stock (`pricing.server.ts`), the cart, search, accounts and the `/api/commerce` endpoints read per request. A few endpoints that hold no buyer data are shared-cached for minutes.
- Shopify operations (`src/lib/commerce/shopify/operations`) never cache. ESLint refuses `"use cache"` and `next/cache` there.
- Webhooks (`/api/webhooks/shopify`) expire the tags for products, collections, metaobjects and the shop. Menus and policies have no webhook and refresh hourly; `POST /api/revalidate/menus` refreshes menus at once.

### Consent

`src/lib/consent/` owns consent. Components use `useConsent()` and `<ConsentGate category="analytics">` from `@/lib/consent/client`.

- Categories: necessary, preferences, analytics, marketing, plus `saleOfData` (US "Do Not Sell or Share").
- Region: `src/proxy.ts` copies the host's geo header (`x-vercel-ip-country`) into the country cookie, so static pages can pick the model in the browser.
- The policy is one object, `CONSENT_POLICY` in [`src/lib/consent/policy.ts`](src/lib/consent/policy.ts). Its defaults:
  - **US: opt-out.** Analytics and marketing run until the visitor opts out. There is no banner; the footer's "Your Privacy Choices" link (`/privacy-choices`) opts out of the sale or sharing of data. This follows US state privacy laws such as the CCPA.
  - **Everywhere else, including the EEA, the UK, Switzerland and unknown countries: opt-in.** Only necessary cookies until the visitor chooses, with a banner. This follows the GDPR, UK GDPR and ePrivacy rules.
  - **Global Privacy Control** always turns off marketing and the sale of data, can't be overridden by a saved choice, and by default turns off analytics too.
- These defaults are a starting point, not legal advice. **The store owner's counsel must confirm them**, along with the banner and privacy pages' wording, before launch and whenever the store starts selling somewhere new.
- The choice is stored in a first-party cookie. Withdrawing analytics or marketing reloads the page, since a vendor script that already ran can't be unloaded.

### Security headers and CSP

Every route gets the headers from `src/lib/security/headers.ts` (applied in `next.config.ts`): HSTS (two years, subdomains), `nosniff`, `X-Frame-Options: DENY`, a `strict-origin-when-cross-origin` referrer policy, a Permissions-Policy that turns off camera, microphone, geolocation and Topics, and `Cross-Origin-Opener-Policy: same-origin`.

The Content Security Policy is **report-only** by default; `CSP_ENFORCE=1` (read at build) enforces the same policy. Reports go to `/api/csp-report`, which logs only the directive and the blocked origin. Every end-to-end test fails on a violation, and `pnpm test:e2e:csp` runs the suite with the policy enforced.

- `script-src` keeps `'unsafe-inline'`: App Router pages carry inline scripts (the RSC payload and streaming helpers) that can't be hashed at build, and nonces need every page rendered per request, which rules out Partial Prerendering.
- Forms post only to this site, the store's checkout (`SHOPIFY_STORE_DOMAIN`, `SHOPIFY_CHECKOUT_DOMAIN`), Shop Pay and customer accounts. Enforcing needs `SHOPIFY_CHECKOUT_DOMAIN`; the build fails without it.
- Vendor allowlists (GTM/GA4, Klaviyo, Attentive, YouTube nocookie) follow the vendors' docs. Check real reports before enforcing, and remove what you don't use.

`pnpm build` ends with `scripts/check-client-secrets.mjs`, which fails if a server secret (or a server-only auth header name) appears in client JS or prerendered pages. It never prints secret values.

### Testing layers

- **Unit and integration** (`pnpm test`, Vitest). Transforms are fed recorded Storefront API fixtures (`src/lib/commerce/testing/fixtures`); operations run against MSW, which fails any request no test handles. Tests never touch the network.
- **Fixture checks** (`fixtures.test.ts`). Fixtures may hold only the synthetic store's domain, tokens and ids, emails at example domains and documentation IPs.
- **End to end** (`pnpm test:e2e`, Playwright). A production build served against a synthetic store built from the same fixtures, with axe accessibility checks on desktop and phone sizes. Nothing reaches the network. See [`e2e/README.md`](e2e/README.md).
- **Performance** (`pnpm perf`). Core Web Vitals and script size per page against `e2e/perf/budgets.json`, on a throttled phone.
- **Live** (`pnpm test:live`, `pnpm fixtures:record`). Cart contract tests and the fixture recorder run against your dev store with `.env.local`.

## Setup

Requires Node 24 (`.nvmrc`) and pnpm 10.

```sh
nvm use
pnpm install
cp .env.example .env.local
pnpm dev
```

The dev server runs on http://localhost:4747. With `SHOP_ENABLED=false` (the default) the site runs without any Shopify settings and the shop pages 404.

### 1. Shopify dev store

Create a development store in the Shopify Partner Dashboard, or use a Plus sandbox store. Shopify's generated sample products are enough to browse; see [Seeding a dev store](#seeding-a-dev-store) for the products the fixtures and tests expect.

### 2. Headless channel tokens

Install Shopify's **Headless** sales channel, create a storefront, and publish your products and collections to it. From the storefront's settings:

- `SHOPIFY_STORE_DOMAIN`: the `*.myshopify.com` host, without `https://`.
- `SHOPIFY_PRIVATE_ACCESS_TOKEN`: the private Storefront API token (server only).
- `NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN`: the public token, for Shopify's browser analytics and consent scripts.
- `SHOPIFY_STOREFRONT_ID`: the storefront id, for analytics attribution.

Turn on the Storefront API permissions the site reads (products, collections and tags, inventory for "Only N left", selling plans, metaobjects, menus, checkouts), then set `SHOP_ENABLED=true` and restart. Metafields read on the storefront (reviews, badges, supplement data) need storefront access set to `PUBLIC_READ` in their definitions.

### 3. Customer Account API

In the Headless storefront's **Customer Account API** settings, copy the client id into `SHOPIFY_CUSTOMER_CLIENT_ID`, and set `CUSTOMER_ACCOUNT_SESSION_SECRET` to 32 or more random characters (`openssl rand -base64 48`). Without both, `/account` says accounts aren't available.

Shopify signs customers in only over HTTPS on a registered origin. Locally, run `pnpm dev:https`, which serves `https://local.tryhydrogen.dev:4747` (a Shopify domain that resolves to your machine; Next writes a local certificate to `certificates/`), and register:

| Setting           | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| Callback URI      | `https://local.tryhydrogen.dev:4747/account/authorize` |
| JavaScript origin | `https://local.tryhydrogen.dev`                        |
| Logout URI        | `https://local.tryhydrogen.dev:4747/`                  |

Or put a Cloudflare quick tunnel in front of `pnpm dev`: `pnpm tunnel` prints the steps, and `pnpm tunnel <tunnel URL>` prints the values to register and checks that sign-in starts. In production, register the same three paths on your domain.

### Environment

Validated in `src/lib/env.ts` (and `src/lib/commerce/config.server.ts` for Shopify). Values are trimmed, and empty means unset. A malformed optional vendor value is ignored with a warning naming the variable, so that vendor turns off instead of the site failing. `src/lib/env-parity.test.ts` fails if the code reads a variable that `.env.example` doesn't list.

| Variable                                  | Scope  | Default                 | Notes                                                                                                                                          |
| ----------------------------------------- | ------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                    | public | `http://localhost:4747` | Canonical URL for metadata, robots and sitemaps.                                                                                               |
| `NEXT_PUBLIC_STORE_NAME`                  | public | `Store`                 | The store's name: page titles, consent banner, email sign-up copy, `llms.txt`.                                                                 |
| `NEXT_PUBLIC_SITE_NAME`                   | public | the store's name        | The name in the header and on the home page, if it differs.                                                                                    |
| `NEXT_PUBLIC_SOURCE_PREFIX`               | public | the store's name        | Prefixes the source of a Klaviyo sign-up (`<prefix> footer`).                                                                                  |
| `NEXT_PUBLIC_COOKIE_PREFIX`               | public | `store_`                | Prefix of the site's own cookies (`src/lib/cookie-names.ts`). Changing it on a live site empties carts and signs customers out.                |
| `SHOP_ENABLED`                            | server | `false`                 | Turns on the shop pages (`src/app/(shop)`) and links. Off = they 404 before any Shopify call. Read at build; redeploy to change.               |
| `SHOP_INDEXED`                            | server | `false`                 | Launch: shop pages become indexable and join the sitemap, and Markdown pages and `llms.txt` turn on. Needs `SHOP_ENABLED`.                     |
| `SHOPIFY_STORE_DOMAIN`                    | server | unset                   | The `*.myshopify.com` host.                                                                                                                    |
| `SHOPIFY_PRIVATE_ACCESS_TOKEN`            | server | unset                   | Headless private Storefront token. The build fails if it reaches client output.                                                                |
| `NEXT_PUBLIC_SHOPIFY_PUBLIC_ACCESS_TOKEN` | public | unset                   | Public Storefront token for Shopify's browser scripts. Unset = no Shopify browser scripts.                                                     |
| `SHOPIFY_STOREFRONT_ID`                   | server | `0`                     | Headless storefront id, for Shopify analytics.                                                                                                 |
| `SHOPIFY_CHECKOUT_DOMAIN`                 | server | unset                   | The store's checkout domain (`checkout.example.com`), allowed by the CSP. Required with `CSP_ENFORCE=1`.                                       |
| `SHOPIFY_WEBHOOK_SECRET`                  | server | unset                   | Verifies Shopify webhooks. Unset = webhooks are refused.                                                                                       |
| `MENUS_REVALIDATE_SECRET`                 | server | unset                   | Bearer secret (32+ characters) for `POST /api/revalidate/menus`. Unset = 404.                                                                  |
| `SHOPIFY_CUSTOMER_CLIENT_ID`              | server | unset                   | Customer Account API client id. Unset = accounts off.                                                                                          |
| `CUSTOMER_ACCOUNT_SESSION_SECRET`         | server | unset                   | 32+ characters; encrypts the customer session cookie. Unset = accounts off.                                                                    |
| `CSP_ENFORCE`                             | server | unset                   | `1` enforces the Content Security Policy (read at build). Unset = report only.                                                                 |
| `NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD`     | public | unset                   | Cart free-shipping progress (e.g. `50.00`). Mirror your Shopify shipping rate. Unset = no bar.                                                 |
| `NEXT_PUBLIC_GTM_ID`                      | public | unset                   | Google Tag Manager container. Unset = no GTM and no Consent Mode script.                                                                       |
| `NEXT_PUBLIC_KLAVIYO_SITE_ID`             | public | unset                   | Klaviyo public key, for `klaviyo.js` only.                                                                                                     |
| `KLAVIYO_PRIVATE_API_KEY`                 | server | unset                   | Klaviyo private key (`lists:write`, `profiles:write`, `subscriptions:write`, `catalogs:write`): sign-up form and back in stock.                |
| `KLAVIYO_LIST_ID`                         | server | unset                   | The list sign-ups join. Unset = no sign-up form and no opt-in on Notify me.                                                                    |
| `NEXT_PUBLIC_ATTENTIVE_BRAND`             | public | unset                   | Attentive brand tag (`cdn.attn.tv/<brand>/dtag.js`).                                                                                           |
| `JUDGEME_PRIVATE_TOKEN`                   | server | unset                   | Judge.me private API token: review lists and the review form. Ratings still show from Shopify's review metafields without it.                  |
| `SHOPIFY_STOREFRONT_PASSWORD`             | server | unset                   | A password-protected dev store's storefront password, for manual QA only. The app never reads it; the build fails if it reaches client output. |

## Optional vendors

Each vendor is an adapter that does nothing until its env vars are set, and every browser script waits for the matching consent. Components call `track(name, payload)` from `@/lib/analytics/track` and never touch vendor globals; each adapter registers with the consent category it needs. Payloads carry ids, titles and paths only, never personal data.

- **Google Tag Manager and GA4** (`NEXT_PUBLIC_GTM_ID`). A Consent Mode v2 default (everything denied except `security_storage`) runs before anything else, the container loads only with analytics consent, and consent updates follow every change. The site sends `page_view` itself (path only, no query string) on every route change, so in GA4 turn off Enhanced Measurement's "page changes based on browser history events" and fire the GA4 tag on the `page_view` custom event. Checkout events come from Shopify, not from this app.
- **Klaviyo** (`NEXT_PUBLIC_KLAVIYO_SITE_ID`, `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_LIST_ID`). `klaviyo.js` (hosted forms) loads only with marketing consent. The footer sign-up is a server action (validation, honeypot, per-IP limit) that subscribes through Klaviyo's API with the private key, and sold-out variants offer Notify me (Klaviyo back in stock). Needs Klaviyo's Shopify catalog sync and a Back in Stock flow.
- **Attentive** (`NEXT_PUBLIC_ATTENTIVE_BRAND`). Loads the Attentive tag (`dtag.js`) with marketing consent. Only the tag: confirm with Attentive how it handles client-side navigation and consent before building more.
- **Judge.me** (`JUDGEME_PRIVATE_TOKEN`). Review lists and a review form, all server side; reviewers' emails and IPs are dropped. Set Judge.me to require approval for reviews of every rating. Ratings on cards and product pages come from Shopify's standard `reviews.rating` metafields, so they work with any review app.

The app's own rate limits are in memory and per instance, so they're best effort; see the launch checklist for WAF rules.

## Supplement module (optional)

For stores that sell dietary supplements. Products with `supplement.*` metafields get a Supplement Facts panel, other ingredients, allergens, directions and warnings, the DSHEA disclaimer when the page makes structure/function claims, and a California Prop 65 warning. Products without those metafields show none of it, so other stores can ignore the module. The metafields and rules are in [`src/lib/commerce/README.md`](src/lib/commerce/README.md#supplement-facts-dshea-and-prop-65-optional).

All regulatory wording lives in `src/lib/commerce/compliance.ts` and ships as placeholders (`approved: false`): pages show it with a visible `[Placeholder, pending legal review]` marker until counsel approves each entry. The same goes for the marketing opt-in, subscription terms and review incentive disclosure, which any store shows.

## Commands

| Command                | What it does                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`             | Dev server on port 4747.                                                                                                 |
| `pnpm dev:https`       | Dev server on `https://local.tryhydrogen.dev:4747`, for customer sign-in.                                                |
| `pnpm tunnel`          | Steps and values for a Cloudflare quick tunnel, the other way to test sign-in.                                           |
| `pnpm gate`            | Everything before a commit: format check, lint, typecheck (with `hydrogen gql check`) and unit tests.                    |
| `pnpm gate:build`      | `pnpm gate`, then the production build and the client secret scan. For changes to routes, caching, the proxy or layouts. |
| `pnpm test:e2e`        | Builds against the synthetic store and runs Playwright. Run `pnpm exec playwright install chromium` once first.          |
| `pnpm test:e2e:csp`    | The end-to-end suite with the CSP enforced.                                                                              |
| `pnpm perf`            | Core Web Vitals and script budgets per page.                                                                             |
| `pnpm launch:check`    | Fails while any compliance wording is unapproved or any product's allergens don't read cleanly. Needs `.env.local`.      |
| `pnpm fixtures:record` | Re-records the Storefront API fixtures from the dev store in `.env.local`.                                               |
| `pnpm test:live`       | Cart contract tests against the dev store in `.env.local`.                                                               |

## Seeding a dev store

The recorded fixtures come from a dev store holding Shopify's generated sample products (`the-complete-snowboard`, `selling-plans-ski-wax`, `gift-card` and the rest) plus synthetic test products whose handles start with `test-`. To re-record fixtures or run the live tests against your own dev store:

1. Generate Shopify's sample data in the dev store.
2. Create the `test-` products and collections that `src/lib/commerce/testing/fixtures.record.ts` reads: a tee with three options, a product with an optional subscription, a subscription-only product, a sold-out product, one with 150 variants, and so on. The existing fixtures show each one's options and settings. Use made-up data only.
3. Create the discount codes `TEST10` (10% off) and `TEST5OFF` ($5 off a subtotal of $50 or more).
4. For the supplement module, add `supplement.*` metafields to `test-electrolytes` and `test-subscription-only`.
5. Publish everything to the Headless channel, then run `pnpm fixtures:record` and review the diff.

The recorder replaces your store's domain, tokens and visitor ids with synthetic stand-ins and refuses anything that looks like an email address or phone number. Never commit real customer or order data.

## Launch checklist

- [ ] Replace the placeholder pages and copy: the home page, `/privacy`, `/terms`, `/cookies`, `/privacy-choices` and the consent banner.
- [ ] Counsel confirms the consent policy (`src/lib/consent/policy.ts`) and approves every entry in `compliance.ts`, so `pnpm launch:check` passes.
- [ ] `SHOPIFY_CHECKOUT_DOMAIN` is the store's checkout domain, real CSP reports are clean, and `CSP_ENFORCE=1` is set.
- [ ] `SHOP_INDEXED=true` once the shop should be indexed (the sitemap, robots, Markdown pages and `llms.txt` follow).
- [ ] Webhooks registered with `SHOPIFY_WEBHOOK_SECRET` set: Admin API `webhookSubscriptionCreate` with `uri` `https://<host>/api/webhooks/shopify` for `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `COLLECTIONS_CREATE`, `COLLECTIONS_UPDATE`, `COLLECTIONS_DELETE`, `METAOBJECTS_CREATE`, `METAOBJECTS_UPDATE`, `METAOBJECTS_DELETE` and `SHOP_UPDATE`.
- [ ] WAF rate-limit rules (Vercel WAF or your host's) for the newsletter server action, `/api/commerce/predictive-search`, `/api/commerce/browse`, `/api/mcp`, `/api/ucp/mcp` and `/discount/*`.
- [ ] The Customer Account API callback, JavaScript origin and logout URI registered for the production domain.
- [ ] Order notification emails link to `https://<site>/account/orders/{{ order.id }}` if order pages should be here (Shopify admin, Settings > Notifications).

## License

MIT. See [LICENSE](LICENSE).
