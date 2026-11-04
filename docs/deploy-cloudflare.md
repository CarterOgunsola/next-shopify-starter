# Deploying to Cloudflare

Vercel is the default host and needs nothing extra. The starter can also build for Cloudflare Workers through the [OpenNext adapter](https://opennext.js.org/cloudflare) (`@opennextjs/cloudflare`), from the same code: `open-next.config.ts`, `wrangler.jsonc` and the `cf:*` scripts are used only by that build, and Vercel ignores them.

## Support status (October 2026)

**Not ready for production yet.** With Next.js 16.4 and Cache Components, `@opennextjs/cloudflare` 1.20.10 has these gaps:

- **Next.js 16.4 doesn't boot without a patch.** The adapter doesn't inline `.next/server/preview-props.json`, so every server-rendered request fails ([#1355](https://github.com/opennextjs/opennextjs-cloudflare/issues/1355)). `patches/` applies the one-line fix from the open upstream PR ([#1356](https://github.com/opennextjs/opennextjs-cloudflare/pull/1356)); drop it (and its entry in `pnpm-workspace.yaml`) once a release includes it.
- **Request-time renders of Cache Components pages hang.** Pages prerendered at build are served from the cache and work, but a page that has to render on the Worker never finishes, and Cloudflare answers 500: an unknown product or collection handle (instead of a 404), and a product page or `/shop` after a webhook expires its tags. Regeneration after a `cacheLife` window lapses takes the same path and is likely affected too. The adapter's work on staged renders under workerd is still open ([#1318](https://github.com/opennextjs/opennextjs-cloudflare/pull/1318)), along with related Cache Components reports ([#1369](https://github.com/opennextjs/opennextjs-cloudflare/issues/1369), [#1349](https://github.com/opennextjs/opennextjs-cloudflare/issues/1349), [#1225](https://github.com/opennextjs/opennextjs-cloudflare/issues/1225)).
- **`proxy.ts` runs as Node.js middleware**, which the adapter supports since 1.20.3 but flags as experimental.

What works locally on workerd (`pnpm cf:preview`): the home page, `/shop`, prerendered product and collection pages with live price and stock, the cart, search, the API routes, `proxy.ts` (Shopify routes, the country cookie), the security headers, and webhooks writing expired tags to the tag cache. Keep Cache Components on: the Vercel build depends on it, and the adapter's own docs list Partial Prerendering and `"use cache"` as supported.

Cloudflare's own Next.js guide now leads with [vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), a Vite reimplementation of the Next.js API; OpenNext runs Next's own build output, which keeps one codebase for both hosts.

## Prerequisites

- A Cloudflare account on the **Workers Paid** plan: the worker is about 3.8 MB gzipped, over the Free plan's 3 MB limit.
- Wrangler signed in (`pnpm exec wrangler login`) or `CLOUDFLARE_API_TOKEN` set, for deploys only. `pnpm cf:build` and `pnpm cf:preview` need no account.

## Resources and bindings

`wrangler.jsonc` has placeholder names (`next-shopify-starter`, `next-shopify-starter-cache`, `next-shopify-starter-tags`) and no account or database ids. Rename them, then create:

| Binding                    | Resource                                 | Create it with                                              | Used for                                                                   |
| -------------------------- | ---------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------- |
| `NEXT_INC_CACHE_R2_BUCKET` | R2 bucket                                | `wrangler r2 bucket create <bucket>`                        | Prerendered pages and `"use cache"` entries (incremental cache).           |
| `NEXT_TAG_CACHE_D1`        | D1 database                              | `wrangler d1 create <database>`, then add its `database_id` | Tags expired by `revalidateTag` (tag cache). The deploy creates the table. |
| `NEXT_CACHE_DO_QUEUE`      | Durable Object `DOQueueHandler` (SQLite) | Deployed with the worker (`migrations` `v1`)                | Background regeneration when a `cacheLife` window lapses.                  |
| `WORKER_SELF_REFERENCE`    | Service binding to this worker           | Its `service` must equal the worker's `name`                | Lets the queue call the worker.                                            |
| `ASSETS`                   | Static assets (`.open-next/assets`)      | Deployed with the worker                                    | `_next/static` and `public/`.                                              |

`HOSTING=cloudflare` is set in `wrangler.jsonc` `vars`. No image binding is needed: product images use Shopify's CDN loader, never Next's optimizer.

## Environment and secrets

The build needs the same variables as on Vercel, since `next build` prerenders pages from Shopify and inlines the `NEXT_PUBLIC_*` values and the settings read at build (`SITE_INDEXED`, `SHOP_ENABLED`, `SHOP_INDEXED`, `CSP_ENFORCE`, `SHOPIFY_CHECKOUT_DOMAIN`). A Workers Builds build and `pnpm cf:deploy` fail without an https `NEXT_PUBLIC_SITE_URL` that isn't localhost (`src/lib/site-url-guard.ts`); `pnpm cf:build` and `pnpm cf:preview` on their own don't check it. The running worker reads its own variables: set the plain ones as `vars` (or in the dashboard) and the secrets with `wrangler secret put <NAME>`:

- `SHOPIFY_PRIVATE_ACCESS_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `MENUS_REVALIDATE_SECRET`
- `CUSTOMER_ACCOUNT_SESSION_SECRET`
- `KLAVIYO_PRIVATE_API_KEY`
- `JUDGEME_PRIVATE_TOKEN`

The adapter also copies the project's `.env` files (`.env`, `.env.production`, `.env.local` and so on) into the worker bundle as defaults, under any `vars` and secrets. Build for deployment from a clean checkout (CI or Cloudflare Workers Builds) with its build variables, never from a machine whose `.env.local` holds secrets you don't mean to upload. `.dev.vars` is ignored by git for the same reason.

## Caching and revalidation

`open-next.config.ts` sets:

- **Incremental cache:** R2, with the regional cache (`withRegionalCache`, long-lived) in front. It holds prerendered pages and every `"use cache"` and `"use cache: remote"` entry; both cache kinds go to the same handler on Workers.
- **Tag cache:** D1 (`d1NextTagCache`). `revalidateTag` from the Shopify webhooks and `POST /api/revalidate/menus` writes the expired tags there, and every cache read checks them. For heavy traffic, switch to `doShardedTagCache` and add its Durable Object binding (`NEXT_TAG_CACHE_DO_SHARDED`, class `DOShardedTagCache`) and migration.
- **Queue:** Durable Objects (`doQueue`), for background regeneration.
- **Cache interception:** off, as the adapter requires with Partial Prerendering.

`pnpm cf:deploy` uploads the build-time cache entries to R2 and creates the D1 table on each deploy. `pnpm cf:preview` does the same against local copies under `.wrangler/`.

## Known differences from Vercel

- The gaps under [Support status](#support-status-october-2026).
- Static files skip the worker, so `next.config.ts` `headers()` doesn't reach them. `scripts/cloudflare-assets.mjs` writes `.open-next/assets/_headers` after each build: immutable caching for `_next/static`, plus `nosniff`, HSTS and, until launch (`SITE_INDEXED`), `X-Robots-Tag: noindex, nofollow`, copied from the build's routes manifest so it matches the pages. Pages and API routes get the full set as on Vercel.
- Responses `src/proxy.ts` answers itself skip `next.config.ts` `headers()` too: OpenNext returns them as they are. That's Shopify's routes (the Storefront API proxy, `/.well-known/ucp`, `/api/mcp`, `/api/ucp/mcp`, `/checkout` and cart permalinks) and Shopify redirects for unmatched URLs. So the proxy adds the same headers to them itself: the list `next.config.ts` built (`src/lib/response-headers.ts`), with the security headers and, until launch, `X-Robots-Tag`. A header the response already has stays as it is, so none goes out twice where the host applies `headers()` as well. `pnpm smoke --shop` checks that `/.well-known/ucp` has them, once each.
- `REDIRECT_HOSTS` redirects run in the worker (OpenNext applies `next.config.ts` redirects, host condition included), so on a listed host, pages, route handlers and `src/proxy.ts` paths redirect, but static files (`_next/static` and `public/`), which skip the worker, are still served there. To drop the workers.dev host altogether instead, set `"workers_dev": false` in `wrangler.jsonc`.
- The rate limits and the Shopify redirect memo are per isolate, as they are per instance on Vercel. Use Cloudflare's rate limiting rules for hard caps (see the [launch checklist](launch-checklist.md)).
- `after()` runs through the Worker's `waitUntil`. The app doesn't use it today.
- There is no Vercel WAF, preview protection or skew protection. OpenNext has an experimental skew protection option.

## Trusting geo and IP headers

`src/lib/host/` reads the visitor's IP and country only from the platform's own headers, picked by `HOSTING`, never guessed from the request:

| `HOSTING`       | IP (`Shopify-Storefront-Buyer-IP`, rate limits) | Country (consent region) | Public origin            |
| --------------- | ----------------------------------------------- | ------------------------ | ------------------------ |
| unset, `vercel` | `x-vercel-forwarded-for`, then `x-real-ip`      | `x-vercel-ip-country`    | `x-forwarded-host/proto` |
| `cloudflare`    | `cf-connecting-ip`                              | `cf-ipcountry`           | the request URL          |

The platform's edge sets and overwrites these headers, so they're only trustworthy on requests that came through it. A client can send any of them itself: `cf-ipcountry` reaching Vercel, or `x-vercel-ip-country` reaching Cloudflare, is just text, which is why the host is configured rather than detected. Don't expose the app by another route (a direct origin URL, another proxy in front) without changing these lists: with Cloudflare's proxy in front of Vercel, for example, pass `cf-connecting-ip` first as the trusted list in `clientIp`. Cloudflare reports `XX` (unknown) and `T1` (Tor) for no country; both count as unknown, which gets the opt-in model.

## Deploy

```sh
# once: create the R2 bucket and D1 database, put their names (and the
# database_id) in wrangler.jsonc, and set the secrets
pnpm cf:deploy
```

Register the webhook and Customer Account API URLs for the Workers domain as in the [launch checklist](launch-checklist.md).
