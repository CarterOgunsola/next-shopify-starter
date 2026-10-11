import { describe, expect, it } from "vitest";
import {
  cleanEventBody,
  cleanStorefrontBody,
  forwardableHeaders,
  forwardableRequest,
} from "./forwarded-request";

const incoming = () =>
  new Headers({
    cookie: [
      "_shopify_essential=e",
      "_shopify_y=y",
      "_tracking_consent=t",
      "store_cart=gid://shopify/Cart/x?key=k",
      "store_customer=sealed",
      "store_customer.1=sealed2",
      "_vercel_jwt=preview-token",
      "__vdpl=dpl",
      "_ga=GA1",
      "__kla_id=k",
    ].join("; "),
    authorization: "Bearer synthetic",
    "x-vercel-oidc-token": "synthetic-oidc",
    "x-vercel-protection-bypass": "synthetic-bypass",
    "sec-gpc": "1",
    "content-type": "application/json",
    "x-shopify-storefront-access-token": "public",
  });

describe("forwardable headers", () => {
  it("keeps only Shopify's storefront cookies", () => {
    expect(forwardableHeaders(incoming()).get("cookie")).toBe(
      "_shopify_essential=e; _shopify_y=y; _tracking_consent=t",
    );
  });

  it("drops authorization and platform headers, keeps what Shopify uses", () => {
    const headers = forwardableHeaders(incoming());
    expect(headers.has("authorization")).toBe(false);
    expect(headers.has("x-vercel-oidc-token")).toBe(false);
    expect(headers.has("x-vercel-protection-bypass")).toBe(false);
    expect(headers.get("sec-gpc")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-shopify-storefront-access-token")).toBe("public");
    expect(
      forwardableHeaders(new Headers({ "sec-fetch-dest": "document" })).get(
        "sec-fetch-dest",
      ),
    ).toBe("document");
  });

  it("removes the cookie header when none of the cookies are Shopify's", () => {
    expect(
      forwardableHeaders(new Headers({ cookie: "store_cart=1; _ga=2" })).has(
        "cookie",
      ),
    ).toBe(false);
  });

  it("keeps the request's method and body", async () => {
    const request = await forwardableRequest(
      new Request("https://local.test/api/mcp", {
        method: "POST",
        body: "{}",
        headers: incoming(),
      }),
    );
    expect(request.method).toBe("POST");
    expect(await request.text()).toBe("{}");
  });
});

describe("what Shopify learns about the page", () => {
  it("cleans the Referer: no search term or filters", () => {
    const headers = forwardableHeaders(
      new Headers({
        referer:
          "https://shop.test/search?q=avery%40example.test&filter.v.option.color=Navy&utm_source=email",
      }),
    );
    expect(headers.get("referer")).toBe(
      "https://shop.test/search?utm_source=email",
    );
  });

  it("cleans the landing page Shopify's consent script sends", async () => {
    const query =
      'mutation { consentManagement(visitorConsent: {analytics: true}, landingPage: "/search?q=hair+loss&utm_medium=x") { ok } }';
    const request = await forwardableRequest(
      new Request("https://shop.test/api/unstable/graphql.json", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          query,
          variables: { input: { landingPage: "https://shop.test/search?q=x" } },
        }),
      }),
    );
    const sent = await request.text();
    expect(sent).not.toMatch(/hair|q=x/);
    const body = JSON.parse(sent);
    expect(body.query).toContain('landingPage: "/search?utm_medium=x"');
    expect(body.variables.input.landingPage).toBe("https://shop.test/search");
  });

  it("leaves other Storefront API bodies as they were", () => {
    const text = JSON.stringify({ query: "query { shop { name } }" });
    expect(cleanStorefrontBody(text)).toBe(text);
    expect(cleanStorefrontBody("not json")).toBe("not json");
  });
});

describe("page URLs Shopify's scripts send through the proxy", () => {
  const TERM = "uniqueterm123";
  const consent = (args: string) =>
    JSON.stringify({
      query: `mutation { consentManagement(visitorConsent: {analytics: true}, ${args}) { ok } }`,
    });

  it("cleans origReferrer and other referrer arguments", () => {
    const out = cleanStorefrontBody(
      consent(
        `landingPage: "/search?q=${TERM}", origReferrer: "https://shop.test/search?q=${TERM}&utm_source=x", referrer: "https://www.google.com/search?q=${TERM}"`,
      ),
    );
    expect(out).not.toContain(TERM);
    const query = JSON.parse(out).query as string;
    expect(query).toContain('landingPage: "/search"');
    expect(query).toContain(
      'origReferrer: "https://shop.test/search?utm_source=x"',
    );
    expect(query).toContain('referrer: "https://www.google.com/search"');
  });

  it("cleans block strings and falls back to / for an unreadable value", () => {
    const out = cleanStorefrontBody(
      consent(
        `landingPage: """/search?q=${TERM}""", origReferrer: "bad\\x${TERM}"`,
      ),
    );
    expect(out).not.toContain(TERM);
  });

  it("cleans the same keys in variables, in any case", () => {
    const out = cleanStorefrontBody(
      JSON.stringify({
        query: "mutation($i: Input) { consentManagement(input: $i) { ok } }",
        variables: {
          i: {
            OrigReferrer: `https://shop.test/?q=${TERM}`,
            landingPage: `/x?q=${TERM}`,
          },
        },
      }),
    );
    expect(out).not.toContain(TERM);
  });

  it("cleans every operation in a batch", () => {
    const out = cleanStorefrontBody(
      JSON.stringify([
        { query: `mutation { a(landingPage: "/search?q=${TERM}") { ok } }` },
        {
          query: "query { shop { name } }",
          variables: { referrer: `/s?q=${TERM}` },
        },
      ]),
    );
    expect(out).not.toContain(TERM);
    expect(JSON.parse(out)).toHaveLength(2);
  });

  it("cleans a GET request's query and variables", async () => {
    const url = new URL("https://shop.test/api/unstable/graphql.json");
    url.searchParams.set(
      "query",
      `query { a(landingPage: "/search?q=${TERM}") { ok } }`,
    );
    url.searchParams.set(
      "variables",
      JSON.stringify({ referrer: `/s?q=${TERM}` }),
    );
    const request = await forwardableRequest(new Request(url));
    expect(decodeURIComponent(request.url)).not.toContain(TERM);
  });

  it("cleans every URL in an event collector body, whatever its key", async () => {
    const body = JSON.stringify({
      events: [
        {
          name: "page_viewed",
          context: {
            document: {
              location: {
                href: `https://shop.test/search?q=${TERM}&utm_source=x`,
              },
              referrer: `https://shop.test/collections/a?filter.v.option.color=${TERM}`,
            },
          },
          path: `/search?q=${TERM}`,
          note: `plain text ${TERM} stays`,
        },
      ],
    });
    expect(
      cleanEventBody(body).replace(`plain text ${TERM} stays`, ""),
    ).not.toContain(TERM);
    for (const path of ["/.well-known/shopify/fec/produce", "/__shopify/x"]) {
      const request = await forwardableRequest(
        new Request(`https://shop.test${path}`, { method: "POST", body }),
      );
      expect(JSON.parse(await request.text()).events[0].path).toBe("/search");
    }
  });
});
