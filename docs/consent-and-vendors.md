# Consent and vendors

## Consent

`src/lib/consent/` owns consent. Components use `useConsent()` and `<ConsentGate category="analytics">` from `@/lib/consent/client`.

- Categories: necessary, preferences, analytics, marketing, plus `saleOfData` (US "Do Not Sell or Share").
- Region: `src/proxy.ts` copies the host's geo header (`x-vercel-ip-country` on Vercel, `cf-ipcountry` on Cloudflare; `src/lib/host/request-geo.ts`) into the country cookie, so static pages can pick the model in the browser. No header, or one that isn't a country, means unknown, which gets the opt-in model.
- The policy is one object, `CONSENT_POLICY` in [`src/lib/consent/policy.ts`](../src/lib/consent/policy.ts). Its defaults:
  - **US: opt-out.** Analytics and marketing run until the visitor opts out. There is no banner; the footer's "Your Privacy Choices" link (`/privacy-choices`) opts out of the sale or sharing of data. This follows US state privacy laws such as the CCPA.
  - **Everywhere else, including the EEA, the UK, Switzerland and unknown countries: opt-in.** Only necessary cookies until the visitor chooses, with a banner. This follows the GDPR, UK GDPR and ePrivacy rules.
  - **Global Privacy Control** always turns off marketing and the sale of data, can't be overridden by a saved choice, and by default turns off analytics too.
- These defaults are a starting point, not legal advice. **The store owner's counsel must confirm them**, along with the banner and privacy pages' wording, before launch and whenever the store starts selling somewhere new.
- The choice is stored in a first-party cookie. Withdrawing analytics or marketing reloads the page, since a vendor script that already ran can't be unloaded.

## Optional vendors

Each vendor is an adapter that does nothing until its env vars are set, and every browser script waits for the matching consent. Components call `track(name, payload)` from `@/lib/analytics/track` and never touch vendor globals; each adapter registers with the consent category it needs. Payloads carry ids, titles and paths only, never personal data.

- **Google Tag Manager and GA4** (`NEXT_PUBLIC_GTM_ID`). A Consent Mode v2 default (everything denied except `security_storage`) runs before anything else, the container loads only with analytics consent, and consent updates follow every change. The site sends `page_view` itself (path only, no query string) on every route change, so in GA4 turn off Enhanced Measurement's "page changes based on browser history events" and fire the GA4 tag on the `page_view` custom event. Checkout events come from Shopify, not from this app.
- **Klaviyo** (`NEXT_PUBLIC_KLAVIYO_SITE_ID`, `KLAVIYO_PRIVATE_API_KEY`, `KLAVIYO_LIST_ID`). `klaviyo.js` (hosted forms) loads only with marketing consent. The footer sign-up is a server action (validation, honeypot, per-IP limit) that subscribes through Klaviyo's API with the private key, and sold-out variants offer Notify me (Klaviyo back in stock). Needs Klaviyo's Shopify catalog sync and a Back in Stock flow.
- **Attentive** (`NEXT_PUBLIC_ATTENTIVE_BRAND`). Loads the Attentive tag (`dtag.js`) with marketing consent. Only the tag: confirm with Attentive how it handles client-side navigation and consent before building more.
- **Judge.me** (`JUDGEME_PRIVATE_TOKEN`). Review lists and a review form, all server side; reviewers' emails and IPs are dropped. Set Judge.me to require approval for reviews of every rating. Ratings on cards and product pages come from Shopify's standard `reviews.rating` metafields, so they work with any review app.

The app's own rate limits are in memory and per instance, so they're best effort; see the launch checklist for WAF rules.
