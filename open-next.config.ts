import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";

// Cloudflare Workers build (pnpm cf:build). Vercel ignores this file.
// See "Deploying to Cloudflare" in the README for the bindings each override
// needs (wrangler.jsonc).
export default defineCloudflareConfig({
  // Prerendered pages and "use cache" entries, in R2, with a per-location
  // copy in the Cache API in front. Tag checks still run on every hit, so a
  // webhook's revalidateTag shows at once.
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: "long-lived",
  }),
  // Tags expired by revalidateTag (the Shopify webhooks, the menus
  // endpoint), in D1. For heavy traffic, switch to doShardedTagCache
  // (overrides/tag-cache/do-sharded-tag-cache) and its Durable Object.
  tagCache: d1NextTagCache,
  // Background regeneration when a cacheLife window lapses, deduplicated in
  // a Durable Object.
  queue: doQueue,
  // Must stay off: it doesn't work with Partial Prerendering.
  enableCacheInterception: false,
});
