import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { formatResults, parseArgs, runSmoke } from "../../scripts/smoke.mjs";

const BASE = "https://site.example";
const OLD = "https://old.example";
const NOINDEX = "noindex, nofollow";

type Answer = {
  status: number;
  robots?: string;
  body?: string;
  location?: string;
};

// A deployment answering from a table of URLs. Anything else is a 404 with
// the given X-Robots-Tag.
function site(routes: Record<string, Answer>, missingRobots?: string) {
  const requests: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init = {}) => {
    const url = String(input);
    requests.push({ url, init });
    const answer = routes[url] ?? { status: 404, robots: missingRobots };
    const headers = new Headers();
    if (answer.robots) headers.set("x-robots-tag", answer.robots);
    if (answer.location) headers.set("location", answer.location);
    return new Response(answer.body ?? "", { status: answer.status, headers });
  });
  return { fetch, requests };
}

const HOME_LINKS = '<script src="/_next/static/chunks/app.js"></script>';

function beforeLaunch(overrides: Record<string, Answer> = {}) {
  return site(
    {
      [`${BASE}/`]: {
        status: 200,
        robots: NOINDEX,
        body: `<meta name="robots" content="noindex, nofollow"/>${HOME_LINKS}`,
      },
      [`${BASE}/privacy`]: { status: 200, robots: NOINDEX },
      [`${BASE}/_next/static/chunks/app.js`]: { status: 200, robots: NOINDEX },
      [`${BASE}/robots.txt`]: {
        status: 200,
        robots: NOINDEX,
        body: "User-Agent: *\nAllow: /\nDisallow: /cart\n",
      },
      ...overrides,
    },
    NOINDEX,
  );
}

function launched(overrides: Record<string, Answer> = {}) {
  return site({
    [`${BASE}/`]: {
      status: 200,
      body: `<link rel="canonical" href="${BASE}"/>${HOME_LINKS}`,
    },
    [`${BASE}/privacy`]: { status: 200 },
    [`${BASE}/_next/static/chunks/app.js`]: { status: 200 },
    [`${BASE}/robots.txt`]: {
      status: 200,
      body: `User-Agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`,
    },
    [`${BASE}/sitemap.xml`]: {
      status: 200,
      body: `<urlset><url><loc>${BASE}/</loc></url><url><loc>${BASE}/privacy</loc></url></urlset>`,
    },
    ...overrides,
  });
}

const failures = (results: { name: string; ok: boolean }[]) =>
  results.filter((result) => !result.ok).map((result) => result.name);

const options = (more = {}) => ({
  base: BASE,
  indexed: false,
  shop: false,
  shopIndexed: false,
  redirectFrom: null,
  ...more,
});

describe("pnpm smoke", () => {
  it("passes a deployment that's right before launch, asking with GET only", async () => {
    const { fetch, requests } = beforeLaunch();
    const results = await runSmoke(options(), fetch);
    expect(failures(results)).toEqual([]);
    expect(results.length).toBeGreaterThan(10);
    for (const { url, init } of requests) {
      expect(init.method).toBe("GET");
      expect(init.redirect).toBe("manual");
      expect(new Headers(init.headers).get("user-agent")).toBe("smoke-check");
      expect(new Headers(init.headers).has("cookie")).toBe(false);
      expect(url).not.toMatch(/\/(discount|account|cart|api)\//);
    }
  });

  it("catches a sitemap that answers 200 instead of 404", async () => {
    const { fetch } = beforeLaunch({
      [`${BASE}/sitemap.xml`]: { status: 200, robots: NOINDEX },
    });
    expect(failures(await runSmoke(options(), fetch))).toEqual([
      "/sitemap.xml answers 404",
    ]);
  });

  it("catches a page without the noindex header, and a sitemap in robots.txt", async () => {
    const { fetch } = beforeLaunch({
      [`${BASE}/privacy`]: { status: 200 },
      [`${BASE}/robots.txt`]: {
        status: 200,
        robots: NOINDEX,
        body: `Allow: /\nSitemap: ${BASE}/sitemap.xml\n`,
      },
    });
    expect(failures(await runSmoke(options(), fetch))).toEqual([
      "/privacy answers 200 with noindex",
      "robots.txt lists no sitemap",
    ]);
  });

  it("passes a launched deployment with --indexed", async () => {
    const { fetch } = launched();
    expect(failures(await runSmoke(options({ indexed: true }), fetch))).toEqual(
      [],
    );
  });

  it("catches a sitemap or canonical URL on another host after launch", async () => {
    const { fetch } = launched({
      [`${BASE}/`]: { status: 200, body: HOME_LINKS },
      [`${BASE}/robots.txt`]: {
        status: 200,
        body: `Sitemap: ${OLD}/sitemap.xml\n`,
      },
      [`${BASE}/sitemap.xml`]: {
        status: 200,
        body: `<urlset><url><loc>${OLD}/</loc></url></urlset>`,
      },
    });
    expect(failures(await runSmoke(options({ indexed: true }), fetch))).toEqual(
      [
        "robots.txt lists only the site sitemap on this host",
        "/sitemap.xml lists URLs on this host",
        "/'s canonical URL is on this host",
      ],
    );
  });

  it("keeps the shop out of search at the site launch", async () => {
    const { fetch } = launched({
      [`${BASE}/robots.txt`]: {
        status: 200,
        body: `Sitemap: ${BASE}/sitemap.xml\nSitemap: ${BASE}/sitemap-shop.xml\n`,
      },
      [`${BASE}/sitemap-shop.xml`]: { status: 200 },
    });
    expect(failures(await runSmoke(options({ indexed: true }), fetch))).toEqual(
      [
        "robots.txt lists only the site sitemap on this host",
        "/sitemap-shop.xml answers 404",
      ],
    );
  });

  it("expects the shop's sitemap and llms.txt with --shop-indexed", async () => {
    const shopLaunched = (robots: string) =>
      launched({
        [`${BASE}/robots.txt`]: { status: 200, body: robots },
        [`${BASE}/sitemap-shop.xml`]: { status: 200 },
        [`${BASE}/llms.txt`]: { status: 200 },
      }).fetch;
    const both = `Sitemap: ${BASE}/sitemap.xml\nSitemap: ${BASE}/sitemap-shop.xml\n`;
    const run = async (robots: string) =>
      failures(
        await runSmoke(
          options({ indexed: true, shopIndexed: true }),
          shopLaunched(robots),
        ),
      );
    expect(await run(both)).toEqual([]);
    expect(await run(`Sitemap: ${BASE}/sitemap.xml\n`)).toEqual([
      "robots.txt lists the site and shop sitemaps on this host",
    ]);
  });

  it("checks the shop with --shop, finding a product on /shop", async () => {
    const { fetch, requests } = beforeLaunch({
      [`${BASE}/shop`]: {
        status: 200,
        robots: NOINDEX,
        body: '<a href="/products/tee">Tee</a>',
      },
      [`${BASE}/products/tee`]: { status: 200, robots: NOINDEX },
      // As Cloudflare answers it: src/proxy.ts skips next.config.ts headers.
      [`${BASE}/.well-known/ucp`]: { status: 200 },
    });
    const results = await runSmoke(options({ shop: true }), fetch);
    expect(failures(results)).toEqual([]);
    expect(results.map((result) => result.name)).toEqual(
      expect.arrayContaining([
        "/shop answers 200 with noindex",
        "a product (/products/tee) answers 200 with noindex",
        "/.well-known/ucp answers 200",
      ]),
    );
    expect(requests.map((request) => request.url)).toContain(
      `${BASE}/products/tee`,
    );
  });

  it("expects a 308 to the same path and query with --redirect-from", async () => {
    const from = `${OLD}/smoke-check-missing/nested?x=1&y=2`;
    const to = `${BASE}/smoke-check-missing/nested?x=1&y=2`;
    const name = `${OLD} redirects here with a 308, keeping the path and query`;
    const run = async (answer: Answer) =>
      failures(
        await runSmoke(
          options({ redirectFrom: OLD }),
          beforeLaunch({ [from]: answer }).fetch,
        ),
      );
    expect(await run({ status: 308, location: to })).toEqual([]);
    expect(await run({ status: 307, location: to })).toEqual([name]);
    expect(
      await run({
        status: 308,
        location: `${BASE}/smoke-check-missing/nested`,
      }),
    ).toEqual([name]);
  });

  it("reports a request that fails instead of throwing", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const results = await runSmoke(options(), fetch);
    expect(results.every((result) => !result.ok)).toBe(true);
    expect(results[0].detail).toContain("request failed: fetch failed");
  });

  it("takes a base URL and the mode flags, and nothing else", () => {
    expect(
      parseArgs([
        `${BASE}/some/path`,
        "--indexed",
        "--shop",
        "--redirect-from",
        OLD,
      ]),
    ).toEqual({
      base: BASE,
      indexed: true,
      shop: true,
      shopIndexed: false,
      redirectFrom: OLD,
    });
    expect(parseArgs([BASE, "--shop-indexed"])).toEqual({
      base: BASE,
      indexed: true,
      shop: false,
      shopIndexed: true,
      redirectFrom: null,
    });
    for (const args of [
      [],
      ["ftp://site.example"],
      [BASE, "--nope"],
      [BASE, "--redirect-from"],
      [BASE, OLD],
    ]) {
      expect(parseArgs(args), args.join(" ")).toHaveProperty("error");
    }
  });

  it("prints a pass/fail table with a summary", () => {
    expect(
      formatResults([
        { name: "a", ok: true, detail: "200" },
        { name: "bb", ok: false, detail: "got 200" },
      ]),
    ).toBe("PASS  a   200\nFAIL  bb  got 200\n\n1 passed, 1 failed");
  });

  it("exits 2 without a base URL", () => {
    const run = spawnSync(process.execPath, ["scripts/smoke.mjs"], {
      encoding: "utf8",
    });
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Usage: pnpm smoke <base-url>");
  });
});
