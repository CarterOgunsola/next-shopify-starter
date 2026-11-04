# End-to-end tests

`pnpm test:e2e` builds the site (`next build`, into `.next-e2e`) and serves
it with `next start`, then runs the Playwright tests here against it in
Chromium, and the accessibility tests again on a phone-sized screen. Install the browser once with
`pnpm exec playwright install chromium`.

## Nothing reaches the network

- `support/serve.mjs` builds and serves the site in the environment
  `support/server-env.mjs` makes (tested in
  `src/lib/e2e-server-env.test.ts`). It blanks every variable in
  `.env.example` (values set in the process take precedence over
  `.env.local`), keeps the caller's Node options, and points the site at a
  synthetic store, `synthetic-store.myshopify.com`, with made-up tokens,
  customer account settings and Judge.me and Klaviyo settings so their forms
  render (Judge.me is answered from `src/lib/reviews/fixtures`; Klaviyo is
  refused, so its forms show their error).
- `support/preload.mjs` is loaded into the build and the server. It answers
  Storefront API requests from `support/synthetic-store.mjs` and refuses any
  other outside host.
- `support/synthetic-store.mjs` serves the recorded fixtures in
  `src/lib/commerce/testing/fixtures` (synthetic dev-store data, recorded
  with `pnpm fixtures:record`). Its catalog is the products with a recorded
  `ProductContent` fixture; any option selection resolves against their
  variants; carts are kept in memory.
- With Next's test proxy on (`E2E=1` in `next.config.ts`), each test's
  server-side requests go to the test's own synthetic store
  (`support/test.ts`), so carts don't leak between tests. In the browser,
  requests to any other host are blocked.

## Writing tests

- Import `test` and `expect` from `./support/test`.
- `shopify.use(...)` answers an operation differently for one test, with MSW
  handlers (see the filter test in `browse.spec.ts`). Only override
  request-time reads and cart calls: cached reads (product pages,
  collections' default views) keep their first answer for every test.
- Use a different product per test where you can, for the same reason.
- Checkout and Shopify sign-in are outside the site: stand in for them with
  `page.route` and check the URL the site sent the browser to.
- Sign-in stops at `/account?login=https` here: Shopify's sign-in needs HTTPS
  and this server is plain HTTP.

`E2E_SKIP_BUILD=1 pnpm test:e2e` reuses the last build while you work on the
tests themselves; `E2E_PORT` changes the port (3100).

## Performance budget

`pnpm perf` (`perf/perf.spec.ts`) loads each page in `perf/budgets.json` on
the same build, as a Pixel 7 with the CPU slowed 4x on slow 4G (150 ms, 1.6
Mbps), and checks largest contentful paint, cumulative layout shift, total
blocking time (standing in for INP) and the page's script, compressed. It
uses plain Playwright rather than `support/test.ts`, whose routing would
skip the network throttling; product images are a typical 828px JPEG
(`perf/product.jpg`) served after slow 4G's delay. The page's own HTML
isn't slowed by the emulation, so its LCP reads a little better than a
real phone's. Raise a budget only with a reason in the commit.

`pnpm next analyze` shows what's in each route's bundles;
`src/lib/client-imports.test.ts` keeps server-only packages (zod) out of
browser code.
