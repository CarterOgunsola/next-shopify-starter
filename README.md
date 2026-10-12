# Next.js Shopify starter

[![CI](https://github.com/CarterOgunsola/next-shopify-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/CarterOgunsola/next-shopify-starter/actions/workflows/ci.yml)

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

## Setup

Requires Node 24 (`.nvmrc`) and pnpm 10.

```sh
nvm use
pnpm install
cp .env.example .env.local
pnpm dev
```

The dev server runs on http://localhost:4747. With `SHOP_ENABLED=false` (the default) the site runs without any Shopify settings and the shop pages 404.

See [Setup](docs/setup.md) for the Shopify dev store, the Headless channel tokens and customer accounts.

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
| `pnpm cf:build`        | The Cloudflare Workers build (OpenNext) into `.open-next/`. See [Deploying to Cloudflare](docs/deploy-cloudflare.md).    |
| `pnpm cf:preview`      | `pnpm cf:build`, then serves it locally on workerd (`wrangler dev`) at http://localhost:8787.                            |
| `pnpm cf:deploy`       | `pnpm cf:build`, then deploys to Cloudflare. Needs a Cloudflare account and the resources below.                         |
| `pnpm launch:check`    | Fails while any compliance wording is unapproved or any product's allergens don't read cleanly. Needs `.env.local`.      |
| `pnpm fixtures:record` | Re-records the Storefront API fixtures from the dev store in `.env.local`.                                               |
| `pnpm test:live`       | Cart contract tests against the dev store in `.env.local`.                                                               |

## Docs

- [Setup](docs/setup.md): the Shopify dev store, Headless channel tokens and the Customer Account API.
- [Environment](docs/environment.md): every variable, its scope and default.
- [Architecture](docs/architecture.md): module boundaries, caching rules and the supplement module.
- [Consent and vendors](docs/consent-and-vendors.md): the consent policy, GTM and GA4, Klaviyo, Attentive, Judge.me.
- [Security](docs/security.md): security headers, the CSP and the client secret scan.
- [Testing](docs/testing.md): test layers, fixtures and seeding a dev store.
- [Deploying to Cloudflare](docs/deploy-cloudflare.md): the OpenNext build and its current gaps.
- [Launch checklist](docs/launch-checklist.md): what to finish before going live.
- [Commerce](src/lib/commerce/README.md): everything that talks to Shopify.
- [End to end tests](e2e/README.md): the synthetic store, Playwright and performance budgets.

## License

MIT. See [LICENSE](LICENSE).
