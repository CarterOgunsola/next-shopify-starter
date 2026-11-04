# lib/commerce

The only code that knows Shopify exists. Pages and components import domain types from `@/lib/commerce` and server functions from the `*.server` modules here; ESLint blocks `@shopify/*` everywhere else.

## Layout

| Module                                                 | What                                                                                                                                                           | Cached |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `types.ts`                                             | Domain types: `ProductContent` (buyer-neutral) vs `VariantState` (buyer-specific), cart, listings                                                              |        |
| `audience.ts`                                          | `BuyerContext`, and the only place a `PublicContext` is minted                                                                                                 |        |
| `buyer.server.ts`                                      | `getBuyerContext()` (consumer until customer accounts) and `getBuyerIp()` for the current request. Used by uncached calls only                                 |        |
| `config.server.ts`                                     | `API_VERSION` (from `api-version.ts`, which the end-to-end tests also read), locale, currency; env validation                                                  |        |
| `money.ts`, `tags.ts`                                  | Display formatting; cache tag names shared with webhooks                                                                                                       |        |
| `catalog.server.ts`                                    | Product content, collections, menus, sitemap. `PublicContext` only                                                                                             | Yes    |
| `pricing.server.ts`                                    | Variant state and listing prices for a buyer                                                                                                                   | No     |
| `browse.server.ts`                                     | Filtered/sorted listings and search                                                                                                                            | No     |
| `cart.server.ts`, `cart.actions.ts`, `cart.client.tsx` | Cart read, server-action mutations, client state. Cookie `store_cart`                                                                                          | Never  |
| `discount.server.ts`                                   | Discount codes and `/discount/{code}`                                                                                                                          | No     |
| `webhooks.server.ts`                                   | HMAC, dedupe, topic -> tags                                                                                                                                    |        |
| `analytics.client.tsx`, `customer.server.ts`           | Shopify analytics, customer accounts                                                                                                                           |        |
| `shopify/`                                             | Private. Client (`client.server.ts`), errors, gid helpers, `fragments/` (gql), `operations/` (uncached fetches), `transforms/` (Shopify shape -> domain types) | Never  |
| `testing/`                                             | MSW server and helpers, recorded fixtures, fixture recorder                                                                                                    |        |

Functions not built yet (per-buyer price lists, `getPriceList`) throw `NotImplementedError`.

Caching rule: every function in `catalog.server.ts` that calls Shopify (an operation's `fetch*`, or `findShopifyRedirect`) has `"use cache"` or `"use cache: remote"` (checked by `pnpm test`, `caching.test.ts`), and every export takes a `PublicContext` (from `publicContext()`), so a signed-in buyer can't reach a shared cache (a type check in the same file, enforced by `pnpm typecheck`, not by the test run). Exports that only combine cached reads (`getProductContent()`, `getShopifyRedirect()`) aren't cached themselves. Nothing in `pricing.server.ts` is cached; it takes the `BuyerContext` from `getBuyerContext()`.

Lint rules (`eslint.config.mjs`):

- `@shopify/*` only inside `lib/commerce/shopify`; `lib/commerce/shopify` only from inside `lib/commerce`.
- No `next/cache` inside `lib/commerce/shopify`: operations stay uncached, `catalog.server.ts` decides caching.
- `*.server` modules must import `server-only`, and `"use client"` files can't import them.

`pnpm typecheck` also runs `hydrogen gql check`, which validates every `gql()` document against the Storefront schema bundled with Hydrogen.

## Storefront client

Every Storefront API call goes through `storefrontRequest(doc, { variables, buyerIp })` in `shopify/client.server.ts`. Documents are written with Hydrogen's `gql()` inside `lib/commerce/shopify/` and are validated by `pnpm gql:check`.

- **Env.** `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_PRIVATE_ACCESS_TOKEN`, checked by `config.server.ts` on the first call. A missing or malformed value throws `CommerceConfigError` naming the variable, never the value. The site runs without them while the shop is off.
- **Two clients.** With `buyerIp`, a request-scoped `private` client that sends `Shopify-Storefront-Buyer-IP` (cart, live price and stock, search). Without it, one shared `private_no_buyer_context` client for reads inside `"use cache"`. Get `buyerIp` from `clientIp(headers)` in `src/lib/host/client-ip.ts`, which reads only headers the host sets and ignores a forged `x-forwarded-for`.
- **API version** `2026-10` (`API_VERSION`), 10 s timeout.
- **Errors** (`shopify/errors.ts`):
  - `ShopifyTransientError`: `THROTTLED`, 429, 5xx, timeouts, network failures. Safe to retry later.
  - `ShopifyRequestError`: other GraphQL errors, 401/403, 430 security rejection.
  - `ShopifyUserError` and `assertNoUserErrors()`: mutation `userErrors` (cart, discounts).
  - Caller aborts and config errors pass through unchanged.
- **Logs.** Failures and calls over 2 s log `[shopify] <operation> ...` with the status, error codes and Shopify request id. Never variables or tokens. GraphQL error messages are added outside production only.
- **Token safety.** `pnpm build` runs `scripts/check-client-secrets.mjs`, which fails if the token value or the `Shopify-Storefront-Private-Token` header name appears in `.next/static` or prerendered pages.
- **Tests** mock the endpoint with MSW (`msw/graphql`, matched by operation name).

## Product pages

- `/products/{handle}` is static per handle (`ensureStatic = "navigation"`, `instant = false`): every published product is prerendered from `listProductHandles()`, others render on first visit, and unknown, unpublished or malformed handles (`isValidHandle()`) return a real 404 without reaching Shopify.
- Content comes from `getProductContent()`: `"use cache"`, tagged `product-<handle>` and `product-id-<id>`.
- Per-handle reads (`getProductContent()`, `getDefaultVariantView()`, `getCollection()`, the variant and browse endpoints) first check the handle against the cached handle lists (`listProductHandles()`, `listCollectionHandles()`, expired by the `products-index` and `collections-index` tags). A made-up handle never reaches Shopify and leaves no cached miss behind. Before its 404, a missing product or collection page checks for an old handle against one cached list of the store's product and collection URL redirects (`getShopifyRedirect()`, refreshed hourly), so that check doesn't ask Shopify about the path either. Only a store with more than 5,000 redirects falls back to a lookup per path, with a miss cached for minutes. Next still keeps the rendered 404 page per URL in its ISR cache.
- Images use `ShopifyImage`, a `next/image` with a loader that asks Shopify's CDN for each width (`?width=`), so they skip Next's optimizer. `images.remotePatterns` still allows only `cdn.shopify.com/s/files/**`.
- External videos (YouTube) render as links, not embeds, because hosted players set cookies before consent.
- JSON-LD `Product` from `productJsonLd()`; offers come with variant state.
- UI tests build domain objects from fixtures with `testing/factories.ts`.

## Reviews

- Ratings come from Shopify's standard review metafields, `reviews.rating` and `reviews.rating_count` (written by the review app, storefront access `PUBLIC_READ`), read in the cached product and card fragments (`shopify/transforms/reviews.ts`), so they don't depend on a review app's API. Cards and the product page show "4.7 out of 5 stars, 3 reviews".
- Review text and new reviews go through a provider (`src/lib/reviews/`): Judge.me (`judgeme.server.ts`) when `JUDGEME_PRIVATE_TOKEN` is set, otherwise none. All calls are server side with the private token; reviewers' emails and IPs are dropped there, and names are shown as a first name and initial (a name with @ shows as Anonymous, and the form refuses one). Only reviews the merchant approved are listed: published, not hidden and curated "ok" in Judge.me. A review flagged `incentivized` carries a disclosure (FTC Endorsement Guides; wording in `compliance.ts`, a placeholder until counsel approves it).
- The product page renders the first page of reviews (cached an hour, tag `reviews-<handle>`, since review apps send us no webhook); More reviews loads later pages from `GET /api/reviews?handle=…&page=N` (shared-cached five minutes).
- Write a review: a server action with validation, a honeypot field and a per-IP limit (3 in 10 minutes). The review app holds reviews for moderation (including health claims, under one rule whatever the rating) before publishing; nothing is published directly.
- Judge.me setup: require manual approval for reviews of every rating, so no rating is published faster or held back more than another (16 CFR 465.7 bars suppressing reviews by rating or sentiment). Judge.me's API as recorded has no incentive field: confirm which field marks an incentivized review in the account's setup and map it in `judgeme.server.ts`.
- JSON-LD gets `aggregateRating` and `review` only when the page shows reviews, as search engines require.

## Back in stock

- A sold-out variant offers Notify me when `KLAVIYO_PRIVATE_API_KEY` is set: an email field, a separate unticked "Also send me news and offers", a honeypot and a per-IP limit (5 in 10 minutes). The server action (`src/lib/marketing/back-in-stock.ts`) creates a Klaviyo back-in-stock subscription for the variant (`$shopify:::$default:::<variant id>`), a one-off transactional alert. Marketing email only if the box is ticked, as a separate list subscription. Logs never include the address.
- Klaviyo side: the Shopify catalog sync, a Back in Stock flow, and inventory set to stop selling when out of stock.

## Gift cards

- A gift card product (`isGiftCard`) offers "Send it to someone by email": recipient email (required), name, a message (200 characters) and a send date (within 90 days, empty to send at once). They go on the cart line as the attributes Shopify reads for gift cards (`gift-card.ts`: `__shopify_send_gift_card_to_recipient`, `Recipient email`, `Recipient name`, `Message`, `Send on`, `__shopify_offset`), checked in the browser and again on the server, which accepts no other line attributes. The cart line shows them (Shopify's `__` keys stay hidden).
- One cart field, "Discount or gift card": a code Shopify doesn't know as a discount is taken off again and tried as a gift card (`cartGiftCardCodesAdd`). Shopify answers a gift card it won't apply without an error, so a card counts as applied only when one ending in the code's last characters appears on the cart. A cart holding a gift card product takes no gift card (Shopify's rule, also silent): the message says so.
- Applied cards are listed with what this order uses and what's left on the card, and can be removed (`cartGiftCardCodesRemove`); the summary shows each card before the total, which Shopify gives after gift cards.

## Recommendations

- The product page has "Pairs well with" (Shopify's `COMPLEMENTARY` recommendations) and "You may also like" (`RELATED`), each in its own Suspense boundary, cached per product and intent. Gift cards aren't recommended.
- Pairings are set by merchandisers in Search & Discovery > Product recommendations, or through its product metafield `shopify--discovery--product_recommendation.complementary_products`; related products come from Shopify's model.
- The cart drawer shows what pairs with the product just added (`GET /api/commerce/recommendations?handle=…`, shared-cached five minutes), leaving out what's in the cart. A product with a single available variant that needs no choices (no plan, not a gift card) has an Add button; others link to their page.

## Shop Pay express

- Product page: "Buy with Shop Pay" for a resolved, available one-time purchase (not a plan, not a gift card). It's a plain form post to `POST /cart/buy-now`, which creates a cart of its own for that product (the visitor's cart is left alone) with the visitor's discount codes and, when signed in, the customer, then redirects to its checkout as Shop Pay express (Hydrogen's `getShopPayButtonUrl` parameters: `payment=shop_pay` and `source`; no `channel`, which Hydrogen says to leave out unless checkout needs the attribution). A second click while it's on its way is ignored; signing back in on the way (token refresh) returns to Shop Pay. Unlike Shopify's cart permalink, nothing the visitor applied is lost.
- Cart: "Check out with Shop Pay" (`/cart/checkout?payment=shop_pay`), the same checkout with the Shop Pay parameters; not offered when the cart has a plan or a gift card.
- The CSP's `form-action` allows the store's `*.myshopify.com` and `shop.app`, where the form's redirect goes; a custom checkout domain needs adding there.

## Badges

- Built in the transforms (`badges.ts`), wording in `compliance.ts`. Cards: Sold out; Sale, or "Save N%" when there's one price and one compare-at; New for 30 days after publishing; Subscription available; and up to two merchant badges. The product page shows New, Subscription available and merchant badges by the title (its price and stock are live in the purchase panel).
- A sale is claimed only when every variant has a compare-at price above its price and the card read all of them (up to 10). Shopify's `compareAtPriceRange` leaves out variants without one, so it isn't used.
- Merchant badges: a product metafield `custom.badges`, a list of metaobject references to a `badge` metaobject definition with a single-line text field `label` (active entries only reach the storefront). Tags are never read.
- "Only N left" is on the product page only, from the live variant state: a tracked, in-stock variant at or below five units (`LOW_STOCK_AT`). Cards are cached, so they don't show stock levels. Needs the storefront token's inventory scope; untracked and backordered variants report 0 and show nothing.

## Quick add

- Product tiles have quick add for products that can be bought. A product whose only variant needs no choices (no plan, not a gift card) has an Add button. Others open a native dialog with the product page's purchase panel (`ProductPurchase`, its selection kept in the dialog rather than the page's URL). The dialog is for choosing and adding: it leaves out Shop Pay express and links to the product page.
- The dialog's data comes from `GET /api/commerce/quick-add?handle=…` (options, plans, the cached default variant; shared-cached five minutes), fetched on intent (hover or focus, or the tap itself on touch screens) and once per page load. Live price and stock come from the variant endpoint, as on the product page.
- After an add the dialog closes and the cart drawer opens; closing the drawer returns focus to the tile.

## Recently viewed

- The product page adds its handle to a list in this browser's `localStorage` (`recently-viewed`: handles only, newest first, up to eight), only with preferences consent.
- The list is cleared when preferences consent is withdrawn (watched from the header search box, on every page) and when the customer signs out (the sign-out form).
- The empty header search box suggests these products as current cards, one request a product (`GET /api/commerce/cards?handles=<handle>`: each card cached until the product changes, the response shared-cached five minutes), so prices, stock and badges are fresh and no shared cache key holds one visitor's list.

## Menus

- The header shows Shopify's `main-menu` and the footer its `footer` menu (Online Store > Navigation), between this site's own home link and its search, account and cart. Handles and fallbacks are in `menus.server.ts`: when a menu is missing or empty, or Shopify can't be reached, the header shows Shop and the footer Shop and Search.
- Items point at this site's routes by Shopify item type: home, catalog (`/shop`), collections, products, policies (`/policies/…`), search and the account page. Typed-in links on the store's own domains become paths here (any Markets locale prefix dropped); links to other sites stay absolute with `rel="noopener"`; only http(s) links are kept. Shopify pages, blogs and articles have no route here and are left out, except Shopify's "Your Privacy Choices" page (`/privacy-choices`). The footer leaves out its copies of this site's legal links.
- A header item with children is a disclosure button (click, Enter or Space; Escape, moving focus away or clicking elsewhere closes it). Its list starts with a link to the item's own page and shows a third level as a labeled sub-list.
- Shopify sends no webhook when a menu changes. Menus are cached with the `menus` tag and refreshed hourly; to show an edit at once, `POST /api/revalidate/menus` with `Authorization: Bearer $MENUS_REVALIDATE_SECRET` (at least 32 characters; the endpoint 404s until it's set).

## Variant selection and live state

- The selection lives in the URL: `?flavor=lemon&size=30-servings`. Names and values match regardless of case, and regardless of spacing and punctuation when that leaves only one match: where two values share a slug ("XL" and "XL+") or a value has none (all non-Latin), the URL carries the value as written (`variant-selection.ts`). Shopify's own links (feeds, emails, cart lines, structured data) use `?variant=<numeric id>`: the proxy answers those with a 302 to option params (Hydrogen's `handleShopifyRoutes` with `routeTemplates`), and the page still resolves one itself if it arrives some other way. Shopify's scripts get the same route templates and navigate client-side. Other params (`utm_*`, referral codes) are kept.
- The URL changes with `history.replaceState`, never the router: a router navigation would re-render the static product page on the server for every click. Replace, not push, so option clicks don't fill the back button. Refresh and back keep the selection.
- First paint shows the default variant's price and stock from the cached `getDefaultVariantView()` (also the JSON-LD offer, and what crawlers and no-JS visitors see). In the browser, `useVariantView()` posts the selection to `/api/commerce/variant` (never cached, sends the visitor IP) and the live answer replaces it. The cart and checkout always use Shopify's current price.
- `getVariantView()` asks Shopify for `selectedOrFirstAvailableVariant`. Shopify picks the first available variant for an incomplete or unavailable selection; when that would drop a value the visitor chose (a sold-out size), the request is repeated with the rest filled in so their value is kept.
- On arrival, option params are rewritten to the variant Shopify resolved, so bad values drop out and a combination that doesn't exist falls back. After the visitor picks a value, their choice stays even if that combination doesn't exist, and the panel says so.
- Each value is flagged sold out or unavailable for the rest of the selection, from `encodedVariantAvailability` and `encodedVariantExistence` (decoded in `shopify/encoded-variants.ts`). Unavailable values stay focusable (`aria-disabled`) so keyboard and screen reader users learn why; arrow keys move within each option.
- The gallery leads with the selected variant's image, from `ProductContent.variantImages`, with no request. Images without alt text use the product title.
- The add button is disabled with a stated reason (loading, error with retry, combination unavailable, sold out). An `aria-live` region announces each loaded variant.

## Cart

- `cart.actions.ts` (server actions: `addCartLines`, `updateCartLines`, `removeCartLines`) validate input, refuse while the shop is off, and call `cart.server.ts`. Each returns a `CartResult`: the updated cart, or a message for the visitor plus the cart as it stands.
- The cart is created on the first add. Its id is kept only in the `store_cart` cookie (HttpOnly, Secure, SameSite=Lax, 14 days). The cookie is written only when the cart id changes: setting a cookie in a server action makes Next re-render the current page in the response, so ordinary quantity changes don't touch it.
- Lines are changed by line id. Quantity 0 removes a line. The same variant with and without a subscription plan is two lines (Shopify's behavior, covered by the live contract test).
- An unknown, expired or completed cart (Shopify reports a user error on `cartId`) is replaced quietly when adding. When updating or removing, the cookie is cleared and the visitor is told the cart expired.
- Shopify warnings (sold out, quantity reduced, discount problems) come back as `cart.warnings` in our wording (`cart-messages.ts`). Sold-out lines at quantity 0 are dropped from `cart.lines`.
- `getCart()` reads the cart once per request and never touches the cookie, so it's safe in server components.
- `pnpm test:live` runs contract tests against the dev store in `.env.local` (create, add, update, remove, unknown cart). They leave an abandoned cart behind.

## Cart UI

- `CartProvider` (`cart.client.tsx`, mounted in the root layout when the shop is on) reads the cart in the browser from `GET /api/commerce/cart` (never cached), so static pages stay static. `useCart()` gives the cart, `add`, `setQuantity`, `remove`, the drawer state and an announcement for the `aria-live` region.
- Quantity changes show at once (`useOptimistic`) and roll back if Shopify refuses. While a change is pending, checkout is disabled with a note. Totals and line amounts are always Shopify's; `cart-view.ts` only counts items.
- The header cart button opens a native modal `<dialog>` (focus trapped, Escape closes, focus returns to what opened it or to the cart button). `/cart` server-renders the cart from the cookie so it shows before the store loads; the controls need JavaScript.
- Lines show the product, variant, plan, unit and compare-at price, line and order discounts (`discountAllocations(lineLevelOnly: false)`), and the line total. Typed quantities apply on Enter or blur.
- The browser never gets the cart id (it carries the cart's access key) or the checkout URL: it gets `Cart`, with `analyticsId` (the id without its key) for analytics. `CartRecord` is server only. Check out is a plain link to `/cart/checkout`, which redirects to Shopify's checkout URL read on the server.
- The product page's add button sends the variant, quantity (`quantity.ts` applies Shopify quantity rules) and plan. Subscription-only products start on their first plan with no one-time option. A successful add opens the drawer.

## Discounts and free shipping

- `applyCartDiscountCode` and `removeCartDiscountCode` (server actions, `discount.server.ts`). Codes match regardless of case and aren't added twice. A code with no cart yet creates one (a discount link can arrive before any item).
- Shopify keeps codes that don't apply yet (minimum not reached, no eligible items) and applies them once the cart qualifies; we do the same. Unknown and inactive codes are taken off again. The visitor gets one reason for the code they just applied, in our wording (`cart-messages.ts`). Shopify reports the reason as a cart warning whose message names the code, which is how it's matched (`warningFor`).
- `/discount/{code}?redirect=/path` (Shopify's link format, used by Collabs and emails) applies the code and redirects to a same-origin path only (`safeRedirectPath`), otherwise to `/`. Responses are `noindex` and never cached.
- Free-shipping progress compares Shopify's cart subtotal with `NEXT_PUBLIC_FREE_SHIPPING_THRESHOLD` in whole cents, for display only; Shopify decides shipping at checkout. Unset means no progress bar.

## Webhooks and cache tags

- `POST /api/webhooks/shopify` checks the HMAC (`x-shopify-hmac-sha256`, `SHOPIFY_WEBHOOK_SECRET`) and the shop domain, answering 401 otherwise. It skips a webhook id it has already handled (per instance; repeats are harmless anyway) and expires tags with `revalidateTag(tag, { expire: 0 })`, so the next request rebuilds the page.
- While `SHOP_ENABLED` is off, `POST /api/webhooks/shopify` answers 404 before reading any env (nothing is cached from Shopify then). Shopify retries failed deliveries and can remove a subscription that keeps failing, so register webhooks once the shop is on.
- Topics map to tags in `tagsForWebhook`: `products/*` to `product-id-<id>`, `product-<handle>` and `products-index`; `collections/*` likewise; `metaobjects/*` to `metaobject-<type>`; `shop/update` to `shop` (shop id and policies; policies also refresh hourly, since Shopify has no webhook for policy edits). Deletes only carry the id, so every cached product read is tagged by id too. Stock changes have no product webhook: `inventory_levels/update` names only the inventory item and location, and mapping that to a product needs the Admin API (this site has Storefront API tokens only). Until an Admin token is added for that, the cached product read (the product page's content, default variant and structured data) refreshes hourly, so its stated availability is at most about an hour behind; the purchase panel's stock is live.
- Logs record the topic and tags only, never the payload.
- To register (Admin API, once the site has a public HTTPS URL): `webhookSubscriptionCreate` for `PRODUCTS_CREATE`, `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `COLLECTIONS_CREATE`, `COLLECTIONS_UPDATE`, `COLLECTIONS_DELETE`, `METAOBJECTS_CREATE`, `METAOBJECTS_UPDATE`, `METAOBJECTS_DELETE` (once metaobject content is cached), `SHOP_UPDATE`, with `uri` `https://<host>/api/webhooks/shopify`.

## Collections and search

- `/collections/{handle}` is static per handle like product pages, so unknown or unpublished collections are a real 404. Under Partial Prerendering a route that reads query params on the server answers 200 for unknown handles, which is why filtering isn't server-rendered. The default view (first page, no filters, default sort) is prerendered from the cached `getCollection()` (tags `collection-<handle>`, `collection-id-<id>`, `products-index`). `/collections/all` lists every product when the store has no collection with that handle (no facets; Shopify's root product list has none).
- Filters, sort and pages use Shopify's Liquid-compatible params (`filter.v.option.color=Navy`, `filter.v.price.gte=10`, `sort_by=price-ascending`, `after`/`before` cursors), built with Hydrogen's helpers (`shopify/browse-params.ts`, `browse-url.ts`). With them in the URL, `useBrowse()` loads the listing from `GET /api/commerce/browse` (never cached) and keeps the previous results on screen, marked busy, while it loads. URL changes use `history.pushState`, so back undoes a filter or page and the page isn't re-rendered on the server.
- The controls are a real GET form and the chips and page links are real links, but the results for a filtered URL load in the browser: filtering and search need JavaScript.
- Facets come from Shopify Search & Discovery: list and boolean values as checkboxes, price as min and max (applied on blur or Enter). Values with no products are disabled unless active.
- `/search?q=` searches products (relevance or price sort, facets, cursor pages). The header search box is an ARIA combobox fed by `GET /api/commerce/predictive-search` (debounced, stale requests cancelled, two characters minimum): queries, products and collections, arrow keys to move, Enter to open, Escape to close.
- Listing tiles show the consumer price (or "From" for a range), the compare-at price when higher, and "Sold out".

## Shopify analytics

- `CommerceScripts` renders Hydrogen's `ShopifyScripts` in the server HTML (its inline bootstrap only runs when delivered with the page) with `channel: "headless"` and the shop's id (`getShopAnalyticsConfig()`, cached), storefront id and domain. `CommercePageViews` publishes a page view on load and every navigation.
- Consent: `custom-banner` mode. The setup waits for our consent (`whenConsentKnown()` from `lib/consent`), hands Shopify's Customer Privacy API all four purposes, then follows every change. Shopify buffers events until then and drops them when denied. Before consent, the Customer Privacy API itself reports to Shopify (`customer_privacy_api_events`); no storefront events are sent.
- `analytics.client.tsx` is the one place commerce events leave the app: product, list, search and cart views, plus cart additions and removals from confirmed carts. Each goes to Shopify's bus and to our `track()` bus (GA4 ecommerce names via GTM), except searches, which go to GA only as a result count. Shopify's analytics script reports every event with the page's own URL, query included, whatever the payload says, so no Shopify event goes out from `/search` or from a page with `q` or `filter.*` params; a cart change made there resets the cart tracker's baseline instead. View events carry a cleaned URL (origin, path and campaign or click ids only; `lib/analytics/clean-url.ts`). Payloads carry product ids, titles, variant titles, brand, price and quantity, never customer data. Our `track()` doesn't buffer, so events before consent are dropped there. Analytics failures are caught and never affect the shop.
- Cart events: Hydrogen's `trackCartAnalytics` is fed our confirmed carts through a small adapter (`createCartTracker`), never optimistic ones. It starts only after the visitor's cart has been read, with that cart as its baseline, so the cart they arrive with isn't reported as added (Hydrogen's own check relies on localStorage). An expired cart restarts it from an empty baseline, with no removals reported.
- Shopify page views fire on path changes only: filters, sort, pages and variant selection change the query string, not the page.
- `src/proxy.ts` runs Hydrogen's `handleShopifyRoutes` (a private client with the visitor's IP and our storefront id; browser requests still carry the public token, the private one is never forwarded) before Next routing: the same-origin Storefront API proxy at `/api/<version>/graphql.json` that Shopify's consent and analytics use, plus Shopify paths such as `/checkout` and cart permalinks. Shopify's agent endpoints are on while the shop is on: `/api/ucp/mcp` (UCP: catalog search, product lookup, carts, checkout), `/api/mcp` (Storefront MCP: store policies and FAQs) and `/.well-known/ucp` (the UCP business profile, a public JSON document cached for a minute; no visitor cookies are sent for it). UCP calls need an agent profile URL in `meta.ucp-agent.profile`. Both are consumer context only, never cached, rate-limited by the host's WAF (see `docs/launch-checklist.md`). Only allowlisted headers and Shopify's own cookies are forwarded (`forwarded-request.ts`), so no cart id or customer session leaves our side; the Referer, the landing page and original referrer Shopify's consent script records (as GraphQL arguments or variables, single, batched or GET), and every URL with a query in Shopify's event collector bodies (`/.well-known/shopify/fec/produce`, `/__shopify/*`) are cleaned like analytics URLs, so a search term doesn't reach Shopify. Unmatched URLs are checked for a Shopify redirect by path, remembered per server instance (an hour for a redirect, five minutes for none, 30 seconds after a failed or 2-second-slow lookup), with concurrent lookups of a path shared; `?redirect=` and `?return_to=` lookups are limited to 20 a minute per client.
- After launch (`SHOP_INDEXED`), agents can read pages as text: a request for a product, collection or policy URL that prefers `text/markdown` gets a Markdown version (rewritten in `src/proxy.ts` to `/md/...`, with `Link: <page>; rel="canonical"` and `Vary: Accept`, cached for a minute), and `/llms.txt` lists the products, policies and agent endpoints. Both 404 before launch.
- CSP allows `cdn.shopify.com` scripts and `monorail-edge.shopifysvc.com`. zod runs `jitless` so it never probes `eval`.

## Customer accounts

- Hydrogen's handlers (`/account/login`, `/account/authorize`, `/account/refresh`, `/account/logout`) run in `src/proxy.ts` on Shopify's Customer Account API (OAuth with PKCE). The session (tokens and OAuth state) is AES-256-GCM encrypted in an HttpOnly cookie, `store_customer`, split across up to four cookies (`store_customer`, `store_customer.1` to `store_customer.3`) when it's large (`shopify/session-cookie.ts`); a tampered cookie or wrong key reads as signed out. Tokens never reach the browser.
- Needs `SHOPIFY_CUSTOMER_CLIENT_ID` and `CUSTOMER_ACCOUNT_SESSION_SECRET` (32+ characters); without both, `/account` says accounts aren't available. The shop id the endpoints use is looked up from the Storefront API.
- Shopify only signs in over HTTPS on a registered origin. Locally: `pnpm dev:https` (`https://local.tryhydrogen.dev:4747`, a Shopify domain that resolves to this machine), with these in the Headless channel's Customer Account API settings: callback `https://local.tryhydrogen.dev:4747/account/authorize`, JavaScript origin `https://local.tryhydrogen.dev`, logout `https://local.tryhydrogen.dev:4747/` (sign-out returns to `/`). Or through a Cloudflare quick tunnel to `pnpm dev`: `pnpm tunnel` prints the steps, and `pnpm tunnel <tunnel URL>` the values to register for it and a check that sign-in starts. In development only, a `*.trycloudflare.com` host may load dev assets and post server actions (`next.config.ts`) and is always read as HTTPS (`request-origin.ts`); production builds never allow it. On plain HTTP the account routes send visitors to `/account`, which explains.
- The origin comes from the forwarded host and protocol when present (`request-origin.ts`), so redirects and the same-origin sign-out check match what the visitor used.
- Token lifetimes: the access token lasts as long as Shopify's `expires_in` says (Hydrogen treats it as expired 2 minutes early); the refresh token's lifetime is Shopify's and isn't documented for the Customer Account API, so don't rely on a number; the session cookie itself lasts 30 days. When the access token expires, an account page goes through `/account/refresh` once and comes back with `?refreshed=1`. If Shopify can't be reached for now (network, timeout, 5xx, 429), the session is kept and the page offers to try again. If Shopify answers without a usable token (a 400 or 401, which Hydrogen clears itself, or any other answer), the session's cookies are cleared and the page says the session ended, with a sign-in link back to it. Never a loop: `?refreshed=1` stops a second refresh. Each token request logs its grant, status and Shopify's error code (`[accounts] token …`), never a token.
- `/account` shows sign-in, or the customer's name, email, recent orders and a sign-out form; `/account/orders` lists up to 20 orders. Pages only read the session; an expired access token goes through `/account/refresh` once. Sign-in links and the sign-out form are plain HTML: they redirect to Shopify.
- After sign-in, `/account/link-cart` ties the visitor's cart to the customer (`cartBuyerIdentityUpdate`) so checkout knows who they are, then continues to a same-origin `return_to`. Signing out also clears the cart cookie, so a shared device doesn't keep the previous customer's cart (only when sign-out succeeds).
- Signed-in checkout: a new cart is created with the customer attached (`buyerIdentity.customerAccessToken`). Signing in and every token refresh go through `/account/link-cart`, which attaches the visitor's cart to the customer again. `/cart/checkout` attaches it once more, reads a fresh checkout URL and adds `logged_in=true` (what Hydrogen's own cart handlers add); an expired token goes through `/account/refresh` once first. Hydrogen's built-in cart sync (`createCartServerHandlers({customerSession})`) can't be used with our cart: its hook is a private symbol.
- Account pages (dynamic, never cached, noindex): `/account` (overview and recent orders), `/account/orders` (paginated: number, date, status, item count, total), `/account/orders/[id]` (lines, discounts, shipping, tax, totals, each shipment's status, expected delivery and tracking, addresses), `/account/profile` (first and last name; email is read-only, since Shopify signs customers in by it and it changes in Shopify's account) and `/account/addresses` (add, edit, delete, set default). Reads go through the Customer Account API per request (`account.server.ts`); changes are server actions (`account.actions.ts`) that validate input, check the session (refreshing an expired token in place) and put Shopify's userErrors in our words (`account-messages.ts`). Customer data never goes into `"use cache"`, logs or analytics.
- Order ownership: the order page asks the Customer Account API for `order(id)`, which only returns the signed-in customer's own orders; anything else is a 404. The id in the URL is never trusted on its own.
- Shopify's hosted account (`https://shopify.com/<shopId>/account`) still handles subscriptions, returns, payment methods and other apps' pages; the account nav links there once, as Manage on Shopify. Addresses take the state or province from a list for the country (US and Canada, `zones.ts`) and store phone numbers in E.164.
- Order emails: to send "View your order" links here instead of Shopify's order status page, change the link in Shopify admin (Settings > Notifications > the order confirmation and shipping templates) to `https://<site>/account/orders/{{ order.id }}`. That's a template change in Shopify admin, not code. The page asks the customer to sign in first.
- Fixtures under `testing/fixtures/customer/` are hand-written to the Customer Account API schema with synthetic data: recording them needs a real signed-in session.

## Testing

- **No network in tests.** `test/setup.ts` starts one MSW server for every test file, and `vitest.config.mts` points the Shopify env at a synthetic store. A catch-all handler at the end of the list fails any request no test handles. MSW's own unhandled-request check isn't enough here: it lets GraphQL requests to a `graphql.link` URL through when no operation matches.
- **Mock Shopify by operation name:** `server.use(shopify.query("ProductContent", resolver))`, or `server.use(replay("ProductContent", fixture))` to serve a recorded response (`testing/msw.ts`).
- **Fixtures** are raw Storefront API responses in `testing/fixtures/<Operation>.<key>.json`, recorded from the dev store with `pnpm fixtures:record` (`testing/fixtures.record.ts`, needs `.env.local`). The recorder swaps the store's domain and handle for synthetic ones, replaces cart tokens, access keys and Shopify's `_s` and `_y` visitor ids whole with stable synthetic stand-ins (`testing/synthesize.ts`; `fixtures.test.ts` checks every fixture), and refuses anything that looks like an email address or phone number. The dev store holds Shopify's sample catalog and synthetic test products only (see "Seeding a dev store" in `docs/testing.md`). Re-record after a schema or query change and review the diff.
- **Layers:** transform tests feed fixtures to `shopify/transforms/*`. Integration tests call `shopify/operations/*` against MSW. Add both when adding a query.
- **Fixture check** (`testing/fixtures.test.ts`): every fixture here and in `src/lib/reviews/fixtures` may hold only the synthetic store's domain, cart tokens, keys and visitor ids, the synthetic shop id (also in CDN file paths, which the recorder rewrites), emails at example domains and documentation IPs.
- **End to end** (`e2e/`, `pnpm test:e2e`): a production build served against a synthetic store built from these fixtures (`e2e/support/synthetic-store.mjs`, held to the recordings by `testing/synthetic-store.test.ts`), nothing reaching the network; see `e2e/README.md`.

## Why Hydrogen

`@shopify/hydrogen` (framework-agnostic, pinned exact at `2026.10.0`; versions are date-based, so a range wouldn't protect you) provides the Storefront client and typed `gql()` documents, wrapped entirely in `lib/commerce/shopify/`. The cart layer and its cookie are this starter's own. The alternative is `gql.tada` plus a small fetch client: for reads and cart writes the GraphQL documents are identical and the wrapper differs by a few lines, so switching later is cheap.

|                                                                           | Hydrogen                                                                                        | gql.tada + own client                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Typed results and variables                                               | Inferred from the bundled 2026-10 schema, no codegen                                            | Inferred from a schema you download and pin, plus a generated `graphql-env.d.ts` |
| Bad field caught                                                          | `hydrogen gql check` (CI) and TS plugin (editor). Plain `tsc` does not                          | `gql.tada check` and TS plugin. Plain `tsc` does not                             |
| Fragment masking                                                          | No. Fragment fields are inlined; read types off the operation result                            | Yes (`readFragment`, `FragmentOf`)                                               |
| B2B input types (`buyerIdentity.companyLocationId`, `@inContext(buyer:)`) | Yes, by type. Built-in cart helpers don't use them                                              | Yes, by type                                                                     |
| Timeout, error classes, buyer IP                                          | Built in (`StorefrontTimeoutError`, `StorefrontApiError`; buyer IP required for private client) | You write them (about 60 lines)                                                  |
| Client bundle                                                             | 0 (server only)                                                                                 | 0 (server only)                                                                  |
| Install size                                                              | 12 MB (bundled schemas)                                                                         | 0.3 MB                                                                           |

What tips it to Hydrogen:

- **Shopify analytics and Collabs.** Since 2026-04-30 these need a same-origin Storefront API proxy, and Shopify calls a hand-built one unsupported. Hydrogen ships it, plus `ShopifyScripts` with a `custom-banner` consent mode that fits the c15t layer.
- **Customer accounts.** Hydrogen has Customer Account OAuth and a session.
- **URL redirects** (Collabs links) are an interceptor in Hydrogen.
- It is the path Shopify and Vercel (`vercel/shop`) are building on.

### Rules

1. Only `lib/commerce/shopify/**` imports `@shopify/hydrogen`. Pin the exact version; make upgrades their own change, with `hydrogen gql check` and the live contract tests.
2. **Own cart layer.** Hydrogen's cart handlers set a `cart` cookie without HttpOnly or Secure, read the cart id from `?cartId=` and request bodies, assume an `/api/cart` route and have no B2B buyer identity. Cart operations here are written with `gql()` + `client.graphql()` from server actions, and the cart cookie is HttpOnly, Secure and SameSite=Lax.
3. **Two clients.** A request-scoped `type: "private"` client with the visitor's buyer IP for uncached reads and the cart; `private_no_buyer_context` for `"use cache"` reads, which have no request.
4. **`handleShopifyRoutes` runs in `src/proxy.ts`** with only what's used: no cart handlers, and the account handlers only for `/account/*`. It intercepts many paths (`/cart/*`, `/checkout`, `/api/YYYY-MM/graphql.json`, `/api/mcp`, ...), so new routes must not use those paths.
5. GraphQL errors come back in `result.errors`, not as throws. The wrapper turns them into typed errors (THROTTLED is transient).
6. Hydrogen's `cache` option is the Oxygen Cache API. Ignore it; use Next's `"use cache"` and tags.
7. `hydrogen gql check` runs in `pnpm typecheck`. The `@shopify/hydrogen/ts-plugin` tsconfig entry gives the same checks in the editor and writes `storefront-graphql-env.d.ts` and `customer-account-graphql-env.d.ts` at the root (gitignored).

### When to fall back to gql.tada

If a release breaks the client or `gql()` API in a way that costs more than a day, or if the store ends up not needing Hydrogen's analytics proxy or customer accounts.
