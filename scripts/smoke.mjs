// Smoke check for a live deployment, on Vercel or Cloudflare: what next
// start can't show, such as how the host serves each response. GET requests
// only, with no cookies and nothing that creates state (no cart, discount or
// sign-in routes). Prints a pass/fail table and exits non-zero on any
// failure.
//
//   pnpm smoke <base-url>                    before launch: noindex everywhere
//   pnpm smoke <base-url> --indexed          after SITE_INDEXED
//   pnpm smoke <base-url> --shop             the shop pages too
//   pnpm smoke <base-url> --shop-indexed     after SHOP_INDEXED (implies
//                                            --indexed)
//   pnpm smoke <base-url> --redirect-from <origin>
//                                            <origin> redirects to <base-url>
//
// The mode comes from these flags, never from the site under test.

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

// A slug no page has. Always the same, so missing-page cache entries don't
// pile up from run to run.
const MISSING = "smoke-check-missing";

const USAGE =
  "Usage: pnpm smoke <base-url> [--indexed] [--shop] [--shop-indexed] [--redirect-from <origin>]";

// { base, indexed, shop, shopIndexed, redirectFrom } or { error }.
export function parseArgs(args) {
  const options = {
    base: null,
    indexed: false,
    shop: false,
    shopIndexed: false,
    redirectFrom: null,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--indexed") options.indexed = true;
    else if (arg === "--shop") options.shop = true;
    // The shop is only indexed once the site is.
    else if (arg === "--shop-indexed") {
      Object.assign(options, { indexed: true, shopIndexed: true });
    } else if (arg === "--redirect-from") {
      options.redirectFrom = origin(args[++i]);
      if (!options.redirectFrom) {
        return { error: "--redirect-from needs an http(s) origin." };
      }
    } else if (arg.startsWith("--")) return { error: `Unknown option ${arg}.` };
    else if (options.base) return { error: `Unexpected argument ${arg}.` };
    else {
      options.base = origin(arg);
      if (!options.base) return { error: `${arg} isn't an http(s) URL.` };
    }
  }
  return options.base ? options : { error: USAGE };
}

function origin(input) {
  try {
    const url = new URL(input);
    return /^https?:$/.test(url.protocol) ? url.origin : null;
  } catch {
    return null;
  }
}

async function get(fetchImpl, url) {
  const response = await fetchImpl(url, {
    method: "GET",
    redirect: "manual",
    headers: { "user-agent": "smoke-check" },
    signal: AbortSignal.timeout(15_000),
  });
  return {
    status: response.status,
    robots: response.headers.get("x-robots-tag"),
    frame: response.headers.get("x-frame-options"),
    location: response.headers.get("location"),
    body: await response.text(),
  };
}

const noindex = (value) => Boolean(value && /\bnoindex\b/i.test(value));
const robotsMeta = (html) =>
  /<meta name="robots" content="([^"]*)"/i.exec(html)?.[1] ?? null;
const firstLink = (html, prefix) =>
  new RegExp(`href="(${prefix}[^"?#]+)"`).exec(html)?.[1] ?? null;
const staticFile = (html) =>
  /(?:src|href)="(\/_next\/static\/[^"]+\.(?:js|css))"/.exec(html)?.[1] ?? null;

// Each check is { name, ok, detail }.
export async function runSmoke(options, fetchImpl = fetch) {
  const { base, indexed, shop, shopIndexed, redirectFrom } = options;
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok, detail });
  const page = (path) =>
    get(fetchImpl, new URL(path, base).href).catch((error) => ({
      status: 0,
      robots: null,
      frame: null,
      location: null,
      body: "",
      error: error instanceof Error ? error.message : String(error),
    }));
  const describe = (r) =>
    r.error
      ? `request failed: ${r.error}`
      : `${r.status}, X-Robots-Tag: ${r.robots ?? "none"}`;
  // Before launch every response says noindex; after, none does.
  const expectRobots = (name, r, status = 200) =>
    check(
      `${name} answers ${status}${indexed ? " without X-Robots-Tag" : " with noindex"}`,
      r.status === status && (indexed ? r.robots === null : noindex(r.robots)),
      describe(r),
    );

  const home = await page("/");
  expectRobots("/", home);
  const meta = robotsMeta(home.body);
  check(
    indexed
      ? "/ has no noindex robots meta tag"
      : "/ has a noindex robots meta tag",
    home.status === 200 && (indexed ? !noindex(meta) : noindex(meta)),
    home.status === 200 ? (meta ?? "no robots meta tag") : describe(home),
  );

  expectRobots("/privacy", await page("/privacy"));

  const asset = staticFile(home.body);
  if (asset) expectRobots("a static file", await page(asset));
  else check("a static file answers 200", false, "no /_next/static file on /");

  const robots = await page("/robots.txt");
  expectRobots("/robots.txt", robots);
  const sitemaps = [...robots.body.matchAll(/^Sitemap:\s*(\S+)/gim)].map(
    (m) => m[1],
  );
  if (indexed) {
    // The shop's sitemap joins only after the shop's own launch.
    const expected = [
      `${base}/sitemap.xml`,
      ...(shopIndexed ? [`${base}/sitemap-shop.xml`] : []),
    ];
    check(
      shopIndexed
        ? "robots.txt lists the site and shop sitemaps on this host"
        : "robots.txt lists only the site sitemap on this host",
      sitemaps.length === expected.length &&
        expected.every((url) => sitemaps.includes(url)),
      sitemaps.join(", ") || "no Sitemap line",
    );
    const sitemap = await page("/sitemap.xml");
    const locs = [...sitemap.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
      (m) => m[1],
    );
    const elsewhere = locs.filter((loc) => origin(loc) !== base);
    check(
      "/sitemap.xml lists URLs on this host",
      sitemap.status === 200 && locs.length > 0 && elsewhere.length === 0,
      sitemap.status !== 200
        ? `got ${sitemap.status}`
        : elsewhere.length
          ? `other hosts: ${elsewhere.slice(0, 2).join(", ")}`
          : `${locs.length} URLs`,
    );
    const canonical =
      /<link rel="canonical" href="([^"]+)"/i.exec(home.body)?.[1] ?? null;
    check(
      "/'s canonical URL is on this host",
      Boolean(canonical) && origin(canonical) === base,
      canonical ?? "no canonical link on /",
    );
    for (const path of ["/sitemap-shop.xml", "/llms.txt"]) {
      const r = await page(path);
      const status = shopIndexed ? 200 : 404;
      check(`${path} answers ${status}`, r.status === status, describe(r));
    }
  } else {
    check(
      "robots.txt lists no sitemap",
      robots.status === 200 && sitemaps.length === 0,
      robots.status === 200 ? sitemaps.join(", ") || "none" : describe(robots),
    );
    for (const path of ["/sitemap.xml", "/sitemap-shop.xml", "/llms.txt"]) {
      const r = await page(path);
      check(`${path} answers 404`, r.status === 404, describe(r));
    }
  }

  expectRobots("a missing page", await page(`/${MISSING}`), 404);
  // Cloudflare answers these 500 until its adapter is fixed: a real bug, so
  // the check still fails, but it says where that's written up.
  for (const kind of ["products", "collections"]) {
    const r = await page(`/${kind}/${MISSING}`);
    check(
      `an unknown /${kind}/ handle answers 404`,
      r.status === 404,
      r.status === 404
        ? describe(r)
        : `${describe(r)} (on Cloudflare, a known adapter bug: "Request-time renders of Cache Components pages hang" in docs/deploy-cloudflare.md)`,
    );
  }

  if (shop) {
    const shopPage = await page("/shop");
    expectRobots("/shop", shopPage);
    const product = firstLink(shopPage.body, "/products/");
    if (product) expectRobots(`a product (${product})`, await page(product));
    else check("a product answers 200", false, "no product link on /shop");
    // Answered by src/proxy.ts, which adds the next.config.ts headers
    // itself, since Cloudflare skips them there. A header sent twice reads
    // as "DENY, DENY".
    const ucp = await page("/.well-known/ucp");
    expectRobots("/.well-known/ucp", ucp);
    check(
      "/.well-known/ucp sends the security headers once",
      ucp.frame === "DENY",
      ucp.error ? describe(ucp) : `X-Frame-Options: ${ucp.frame ?? "none"}`,
    );
  }

  if (redirectFrom) {
    const path = `/${MISSING}/nested?x=1&y=2`;
    const r = await get(fetchImpl, `${redirectFrom}${path}`).catch((error) => ({
      status: 0,
      location: null,
      error: error instanceof Error ? error.message : String(error),
    }));
    check(
      `${redirectFrom} redirects here with a 308, keeping the path and query`,
      r.status === 308 && r.location === `${base}${path}`,
      r.error
        ? `request failed: ${r.error}`
        : `${r.status}, Location: ${r.location ?? "none"}`,
    );
  }
  return results;
}

export function formatResults(results) {
  const width = Math.max(...results.map((r) => r.name.length));
  const lines = results.map(
    (r) => `${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(width)}  ${r.detail}`,
  );
  const failed = results.filter((r) => !r.ok).length;
  lines.push("", `${results.length - failed} passed, ${failed} failed`);
  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.error) {
    console.error(options.error);
    process.exit(2);
  }
  const mode = [
    options.indexed ? "indexed" : "before launch",
    options.shop && "shop",
    options.shopIndexed && "shop indexed",
    options.redirectFrom && `redirect from ${options.redirectFrom}`,
  ]
    .filter(Boolean)
    .join(", ");
  console.log(`Smoke check of ${options.base} (${mode})\n`);
  const results = await runSmoke(options);
  console.log(formatResults(results));
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

if (realpathSync(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
