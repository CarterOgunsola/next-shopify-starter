import { gql, StorefrontTimeoutError } from "@shopify/hydrogen";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  server,
  shopify,
  STOREFRONT_ENDPOINT as ENDPOINT,
} from "../testing/msw";
import {
  operationName,
  storefrontRequest,
  toShopifyError,
} from "./client.server";
import { ShopifyRequestError, ShopifyTransientError } from "./errors";
import {
  addCartLines,
  createCart,
  fetchCart,
  linkCartToCustomer,
  removeCartLines,
  setCartDiscountCodes,
  updateCartLines,
} from "./operations/cart";

const incoming = vi.hoisted(() => ({
  headers: new Headers(),
  consent: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  headers: async () => incoming.headers,
  cookies: async () => ({
    get: (name: string) =>
      name === "store_vc" && incoming.consent
        ? { value: incoming.consent }
        : undefined,
  }),
}));

// Synthetic token from vitest.config.mts.
const TOKEN = "synthetic-private-token";

afterEach(() => vi.restoreAllMocks());

const ProductTitle = gql(`
  query ProductTitle($handle: String!) {
    product(handle: $handle) {
      title
    }
  }
`);

const SECRET_HANDLE = "synthetic-handle-not-for-logs";

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

describe("storefrontRequest", () => {
  it("sends the private token and returns typed data", async () => {
    let headers: Headers | undefined;
    server.use(
      shopify.query("ProductTitle", ({ request, variables }) => {
        headers = request.headers;
        expect(variables.handle).toBe("synthetic-tee");
        return HttpResponse.json({
          data: { product: { title: "Synthetic Tee" } },
        });
      }),
    );

    const data = await storefrontRequest(ProductTitle, {
      variables: { handle: "synthetic-tee" },
    });

    expect(data.product?.title).toBe("Synthetic Tee");
    expect(headers?.get("Shopify-Storefront-Private-Token")).toBe(TOKEN);
    expect(headers?.has("Shopify-Storefront-Buyer-IP")).toBe(false);
  });

  it("forwards the buyer IP for buyer-driven calls", async () => {
    let buyerIp: string | null = null;
    server.use(
      shopify.query("ProductTitle", ({ request }) => {
        buyerIp = request.headers.get("Shopify-Storefront-Buyer-IP");
        return HttpResponse.json({ data: { product: null } });
      }),
    );

    await storefrontRequest(ProductTitle, {
      variables: { handle: "synthetic-tee" },
      buyerIp: "203.0.113.7",
    });

    expect(buyerIp).toBe("203.0.113.7");
  });

  it("sends the visitor's Shopify cookies and privacy signal, never ours", async () => {
    incoming.headers = new Headers({
      cookie:
        "_shopify_essential=abc; store_cart=gid://shopify/Cart/x?key=k; store_customer=sealed",
      "sec-gpc": "1",
    });
    let sent: Headers | undefined;
    server.use(
      shopify.query("ProductTitle", ({ request }) => {
        sent = request.headers;
        return HttpResponse.json({ data: { product: null } });
      }),
    );

    await storefrontRequest(ProductTitle, {
      variables: { handle: "synthetic-tee" },
      buyerIp: "203.0.113.7",
    });

    expect(sent?.get("cookie")).toContain("_shopify_essential=abc");
    expect(sent?.get("cookie")).not.toContain("store_");
    expect(sent?.get("sec-gpc")).toBe("1");
    incoming.headers = new Headers();
  });

  it("sends no visitor headers on shared reads", async () => {
    incoming.headers = new Headers({ cookie: "_shopify_essential=abc" });
    let cookie: string | null = "unset";
    server.use(
      shopify.query("ProductTitle", ({ request }) => {
        cookie = request.headers.get("cookie");
        return HttpResponse.json({ data: { product: null } });
      }),
    );
    await storefrontRequest(ProductTitle, {
      variables: { handle: "synthetic-tee" },
    });
    expect(cookie).toBeNull();
    incoming.headers = new Headers();
  });

  it("passes the visitor's consent to cart calls that take it", async () => {
    const CartConsent = gql(`
      query CartConsent($id: ID!, $visitorConsent: VisitorConsent)
      @inContext(visitorConsent: $visitorConsent) {
        cart(id: $id) {
          id
        }
      }
    `);
    incoming.consent = "a1m0p1s0";
    let variables: Record<string, unknown> | undefined;
    server.use(
      shopify.query("CartConsent", ({ variables: sent }) => {
        variables = sent;
        return HttpResponse.json({ data: { cart: null } });
      }),
    );
    await storefrontRequest(CartConsent, {
      variables: { id: "gid://shopify/Cart/x" },
      buyerIp: "203.0.113.7",
    });
    expect(variables?.visitorConsent).toEqual({
      analytics: true,
      marketing: false,
      preferences: true,
      saleOfData: false,
    });
    incoming.consent = undefined;
  });

  it("applies the request's Sec-GPC on top of the saved choice", async () => {
    incoming.consent = "a1m1p1s1";
    incoming.headers = new Headers({ "sec-gpc": "1" });
    let variables: Record<string, unknown> | undefined;
    server.use(
      shopify.query("Cart", ({ variables: sent }) => {
        variables = sent;
        return HttpResponse.json({ data: { cart: null } });
      }),
    );
    await fetchCart("gid://shopify/Cart/x", "203.0.113.7");
    expect(variables?.visitorConsent).toEqual({
      analytics: false,
      marketing: false,
      preferences: true,
      saleOfData: false,
    });
    incoming.consent = undefined;
    incoming.headers = new Headers();
  });

  it("passes consent with every real cart operation", async () => {
    incoming.consent = "a0m0p1s0";
    const seen = new Map<string, unknown>();
    const record = (name: string, body: unknown) =>
      shopify.operation(({ operationName, variables }) => {
        if (operationName === name) seen.set(name, variables.visitorConsent);
        return HttpResponse.json(body as { data: Record<string, unknown> });
      });
    const payload = (field: string) => ({
      data: { [field]: { cart: null, userErrors: [], warnings: [] } },
    });
    const ops: [string, () => Promise<unknown>, unknown][] = [
      [
        "Cart",
        () => fetchCart("gid://shopify/Cart/x", "203.0.113.7"),
        { data: { cart: null } },
      ],
      [
        "CartCreate",
        () => createCart([], "203.0.113.7"),
        payload("cartCreate"),
      ],
      [
        "CartLinesAdd",
        () => addCartLines("gid://shopify/Cart/x", [], "203.0.113.7"),
        payload("cartLinesAdd"),
      ],
      [
        "CartLinesUpdate",
        () => updateCartLines("gid://shopify/Cart/x", [], "203.0.113.7"),
        payload("cartLinesUpdate"),
      ],
      [
        "CartLinesRemove",
        () => removeCartLines("gid://shopify/Cart/x", [], "203.0.113.7"),
        payload("cartLinesRemove"),
      ],
      [
        "CartDiscountCodesUpdate",
        () => setCartDiscountCodes("gid://shopify/Cart/x", [], "203.0.113.7"),
        payload("cartDiscountCodesUpdate"),
      ],
      [
        "CartBuyerIdentityUpdate",
        () =>
          linkCartToCustomer(
            "gid://shopify/Cart/x",
            "synthetic-customer-token",
            "203.0.113.7",
          ),
        payload("cartBuyerIdentityUpdate"),
      ],
    ];
    for (const [name, run, body] of ops) {
      server.use(record(name, body));
      await run().catch(() => {});
    }
    const expected = {
      analytics: false,
      marketing: false,
      preferences: true,
      saleOfData: false,
    };
    expect(Object.fromEntries(seen)).toEqual(
      Object.fromEntries(ops.map(([name]) => [name, expected])),
    );
    incoming.consent = undefined;
  });

  it("warns once when Shopify serves a different API version", async () => {
    const warn = silenceWarnings();
    server.use(
      shopify.query("ProductTitle", () =>
        HttpResponse.json(
          { data: { product: null } },
          { headers: { "X-Shopify-API-Version": "2027-01" } },
        ),
      ),
    );
    for (let i = 0; i < 2; i++) {
      await storefrontRequest(ProductTitle, {
        variables: { handle: "synthetic-tee" },
      });
    }
    const versionWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("served version 2027-01"),
    );
    expect(versionWarnings).toHaveLength(1);
  });

  it("treats THROTTLED as transient", async () => {
    const warn = silenceWarnings();
    server.use(
      shopify.query("ProductTitle", () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
        }),
      ),
    );

    const error = await storefrontRequest(ProductTitle, {
      variables: { handle: SECRET_HANDLE },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ShopifyTransientError);
    expect(error).toMatchObject({
      operation: "ProductTitle",
      codes: ["THROTTLED"],
    });
    expect(String(warn.mock.calls[0][0])).toContain("ProductTitle");
  });

  it("treats other GraphQL errors as request errors", async () => {
    silenceWarnings();
    server.use(
      shopify.query("ProductTitle", () =>
        HttpResponse.json({
          data: null,
          errors: [{ message: "Field 'nope' doesn't exist on type 'Product'" }],
        }),
      ),
    );

    await expect(
      storefrontRequest(ProductTitle, { variables: { handle: "x" } }),
    ).rejects.toBeInstanceOf(ShopifyRequestError);
  });

  it.each([
    [503, ShopifyTransientError],
    [429, ShopifyTransientError],
    [401, ShopifyRequestError],
    [430, ShopifyRequestError],
  ])("classifies HTTP %i", async (status, ErrorClass) => {
    silenceWarnings();
    server.use(http.post(ENDPOINT, () => new HttpResponse("nope", { status })));

    const error = await storefrontRequest(ProductTitle, {
      variables: { handle: "x" },
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorClass);
    expect(error).toMatchObject({ status });
  });

  it("treats network failures as transient", async () => {
    silenceWarnings();
    server.use(http.post(ENDPOINT, () => HttpResponse.error()));

    await expect(
      storefrontRequest(ProductTitle, { variables: { handle: "x" } }),
    ).rejects.toBeInstanceOf(ShopifyTransientError);
  });

  it("never logs variables or the token", async () => {
    const warn = silenceWarnings();
    server.use(
      http.post(ENDPOINT, () => new HttpResponse("nope", { status: 500 })),
    );

    await storefrontRequest(ProductTitle, {
      variables: { handle: SECRET_HANDLE },
    }).catch(() => {});

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("ProductTitle");
    expect(logged).not.toContain(SECRET_HANDLE);
    expect(logged).not.toContain(TOKEN);
  });
});

describe("toShopifyError", () => {
  it("maps timeouts to transient errors", () => {
    const error = toShopifyError(
      "ProductTitle",
      new StorefrontTimeoutError(10_000),
    );
    expect(error).toBeInstanceOf(ShopifyTransientError);
    expect(String(error)).toContain("timed out after 10000ms");
  });

  it("passes other errors through", () => {
    const abort = new DOMException("aborted", "AbortError");
    expect(toShopifyError("ProductTitle", abort)).toBe(abort);
  });
});

describe("operationName", () => {
  it("reads the operation name from a document", () => {
    expect(operationName(String(ProductTitle))).toBe("ProductTitle");
    expect(operationName("mutation CartLinesAdd($id: ID!) { x }")).toBe(
      "CartLinesAdd",
    );
    expect(operationName("{ shop { name } }")).toBe("anonymous");
  });
});
