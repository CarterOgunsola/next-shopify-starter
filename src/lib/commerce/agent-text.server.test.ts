import { BRAND } from "@/lib/brand";
import { describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ on: true }));
vi.mock("@/lib/flags", () => ({ isShopIndexed: () => flags.on }));
vi.mock("./catalog.server", () => ({
  // Shopify unreachable for this one product.
  getProductAtRequest: async (_: unknown, handle: string) => {
    if (handle === "test-down") throw new Error("Shopify unreachable");
    return null;
  },
  getShopPolicy: async (_: unknown, handle: string) =>
    handle === "refund-policy"
      ? {
          handle,
          title: "Refund policy",
          bodyHtml: "<p>Returns within <strong>30 days</strong>.</p>",
        }
      : null,
  listProducts: async () => ({
    items: [{ handle: "test-tee", title: "Test Tee" }],
  }),
  listShopPolicies: async () => [
    { handle: "refund-policy", title: "Refund policy", bodyHtml: "" },
  ],
}));

const { handleLlmsTxt, handleMarkdownPage, wantsMarkdown } =
  await import("./agent-text.server");

describe("Markdown for agents", () => {
  it.each([
    ["text/markdown", true],
    ["text/markdown, text/html;q=0.9", true],
    ["text/html, text/markdown;q=0.5", false],
    ["text/html,application/xhtml+xml,*/*;q=0.8", false],
    [null, false],
  ])("Accept %s asks for Markdown: %s", (accept, expected) => {
    expect(wantsMarkdown(accept)).toBe(expected);
  });

  it("serves a policy page as Markdown, pointing search engines at the page", async () => {
    const response = await handleMarkdownPage("policies", "refund-policy");
    expect(response.headers.get("content-type")).toContain("text/markdown");
    // noindex here could drop the HTML page, which shares the URL.
    expect(response.headers.has("x-robots-tag")).toBe(false);
    expect(response.headers.get("link")).toMatch(
      /^<https?:\/\/[^>]+\/policies\/refund-policy>; rel="canonical"$/,
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    expect(await response.text()).toContain("Returns within **30 days**.");
  });

  it("404s for unknown pages and sections, and until launch", async () => {
    expect((await handleMarkdownPage("policies", "nope")).status).toBe(404);
    expect((await handleMarkdownPage("pages", "about")).status).toBe(404);
    flags.on = false;
    expect((await handleMarkdownPage("policies", "refund-policy")).status).toBe(
      404,
    );
    expect((await handleLlmsTxt()).status).toBe(404);
    flags.on = true;
  });

  it("describes the shop and the agent endpoints in llms.txt", async () => {
    const body = await (await handleLlmsTxt()).text();
    expect(body).toContain(`# ${BRAND.name}`);
    expect(body).toContain("/products/test-tee");
    expect(body).toContain("/policies/refund-policy");
    expect(body).toContain("/api/ucp/mcp");
    expect(body).toContain("/.well-known/ucp");
    expect(body).toContain("Accept: text/markdown");
  });

  it("answers 503, uncached, when Shopify can't be reached", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await handleMarkdownPage("products", "test-down");
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("cache-control")).toBe("no-store");
    // A product Shopify says doesn't exist is still a 404.
    expect((await handleMarkdownPage("products", "test-gone")).status).toBe(
      404,
    );
  });
});
