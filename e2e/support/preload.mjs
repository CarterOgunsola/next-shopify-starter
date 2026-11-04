// Loaded into `next build` and `next start` for the end-to-end tests, and
// into `next dev` for `pnpm dev:synthetic` (node --import). Storefront API
// requests to the synthetic store are answered from the recorded fixtures
// (or a dataset's); any other outside host is refused, so the tests never
// reach the network. With the test proxy on, a test's own handlers
// (test.ts) answer that test's requests before this does.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createStore,
  isStorefrontRequest,
  STORE_DOMAIN,
  serveDataset,
} from "./synthetic-store.mjs";

// Judge.me answers from the hand-written review fixture.
const reviews = JSON.parse(
  readFileSync(
    join(process.cwd(), "src/lib/reviews/fixtures/judgeme.reviews.page-1.json"),
    "utf8",
  ),
);
function judgeme(request) {
  const { pathname } = new URL(request.url);
  if (request.method === "POST") return Response.json({ ok: true });
  if (pathname.endsWith("/products/-1")) {
    return Response.json({ product: { id: 777 } });
  }
  if (pathname.endsWith("/reviews")) return Response.json(reviews);
  return new Response(null, { status: 404 });
}

// pnpm dev:synthetic: a dataset's catalog in place of the test products
// (server-env.mjs leaves SYNTHETIC_DATASET empty for the tests).
if (process.env.SYNTHETIC_DATASET) {
  serveDataset(process.env.SYNTHETIC_DATASET, {
    imagesUrl: process.env.SYNTHETIC_IMAGES_URL,
  });
}
const store = createStore();
const original = globalThis.fetch;
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

globalThis.fetch = async function fetch(input, init) {
  const request = new Request(input, init);
  if (isStorefrontRequest(request.url)) {
    return Response.json(store.respond(await request.json()));
  }
  // Shopify's UCP business profile, which the proxy serves at
  // /.well-known/ucp.
  if (request.url === `https://${STORE_DOMAIN}/.well-known/ucp`) {
    return Response.json({ name: "Synthetic", services: [] });
  }
  if (new URL(request.url).hostname === "judge.me") return judgeme(request);
  if (LOCAL.has(new URL(request.url).hostname)) {
    return original.call(this, input, init);
  }
  console.error(
    `[e2e] refused outside request: ${request.method} ${new URL(request.url).host}`,
  );
  return new Response(null, { status: 503 });
};
