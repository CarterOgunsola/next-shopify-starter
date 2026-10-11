import { HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { server, shopify } from "./testing/msw";

vi.mock("next/cache", () => ({ cacheLife: () => {}, cacheTag: () => {} }));
const navigation = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  permanentRedirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
}));
vi.mock("next/navigation", () => navigation);

const { redirectOrNotFound } = await import("./missing-page.server");

type Redirect = { path: string; target: string };
const asked = { list: 0, perPath: [] as string[] };

// The store's URL redirects, one or more pages, and Hydrogen's per-path
// query (operation "redirects"), which should only run for a store with
// more redirects than the list holds.
function store(pages: Redirect[][]) {
  server.use(
    shopify.query("UrlRedirects", ({ variables }) => {
      asked.list++;
      const index = variables.after ? Number(variables.after) : 0;
      const last = index === pages.length - 1;
      return HttpResponse.json({
        data: {
          urlRedirects: {
            nodes: pages[index],
            pageInfo: {
              hasNextPage: !last,
              endCursor: last ? null : String(index + 1),
            },
          },
        },
      }) as never;
    }),
    shopify.query("redirects", ({ variables }) => {
      asked.perPath.push(String(variables.query));
      return HttpResponse.json({
        data: { urlRedirects: { edges: [] } },
      }) as never;
    }),
  );
}

beforeEach(() => {
  asked.list = 0;
  asked.perPath = [];
});

describe("redirectOrNotFound", () => {
  it("follows the store's redirect for an old handle, matched as Shopify does", async () => {
    store([
      [
        { path: "/pages/faq", target: "/pages/help" },
        { path: "/Products/Old-Handle/", target: "/products/new-handle" },
      ],
    ]);
    await expect(redirectOrNotFound("/products/old-handle")).rejects.toThrow(
      "REDIRECT /products/new-handle",
    );
  });

  it("404s a made-up handle without asking Shopify about its path", async () => {
    store([[{ path: "/collections/old", target: "/collections/new" }]]);
    for (const junk of ["/products/a1", "/products/zz9", "/collections/nope"]) {
      await expect(redirectOrNotFound(junk)).rejects.toThrow("NOT_FOUND");
    }
    // Only the shared list was read (one cached entry in production).
    expect(asked.perPath).toEqual([]);
    expect(asked.list).toBe(3);
  });

  it("never redirects off the site", async () => {
    store([[{ path: "/products/old", target: "https://elsewhere.example/x" }]]);
    await expect(redirectOrNotFound("/products/old")).rejects.toThrow(
      "NOT_FOUND",
    );
  });

  it("asks per path only when the store has more redirects than the list holds", async () => {
    const page = (n: number): Redirect[] => [
      { path: `/pages/p${n}`, target: "/" },
    ];
    store(Array.from({ length: 21 }, (_, n) => page(n)));
    await expect(redirectOrNotFound("/products/unlisted")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(asked.list).toBe(20);
    expect(asked.perPath).toEqual(["path:/products/unlisted"]);
  });

  it("doesn't look up paths a handle can't make", async () => {
    store([[]]);
    await expect(redirectOrNotFound("/products/../x")).rejects.toThrow(
      "NOT_FOUND",
    );
    expect(asked.list).toBe(0);
  });
});
