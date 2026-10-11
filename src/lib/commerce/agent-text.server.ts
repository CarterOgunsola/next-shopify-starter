import { BRAND } from "@/lib/brand";
import "server-only";
import { publicEnv } from "@/lib/env";
import { isShopIndexed } from "@/lib/flags";
import { publicContext } from "./audience";
import {
  getCollectionAtRequest,
  getProductAtRequest,
  getShopPolicy,
  listProducts,
  listShopPolicies,
} from "./catalog.server";
import { isValidHandle } from "./handles";
import {
  collectionMarkdown,
  policyMarkdown,
  productMarkdown,
} from "./markdown";

// Text for agents and crawlers, after launch (SHOP_INDEXED; until then the shop is
// noindex and isn't advertised): Markdown versions of product, collection
// and policy pages (src/proxy.ts serves them in place of the page when a
// request asks for text/markdown), and /llms.txt.

const site = () => publicEnv.NEXT_PUBLIC_SITE_URL;

// Short shared caching: prices and stock change. canonical: the HTML
// page this text stands for, so search engines keep indexing that page
// (the Markdown is served at the same URL).
const text = (body: string, type: string, canonical?: string) =>
  new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control":
        "public, max-age=0, s-maxage=60, stale-while-revalidate=300",
      Vary: "Accept",
      ...(canonical ? { Link: `<${canonical}>; rel="canonical"` } : {}),
    },
  });
const markdown = (body: string, path: string) =>
  text(body, "text/markdown", new URL(path, site()).href);
const notFound = () => new Response("Not found", { status: 404 });

export const MARKDOWN_SECTIONS = ["products", "collections", "policies"];

// Shopify unreachable: try again shortly, and never cache the failure.
const unavailable = () =>
  new Response("Temporarily unavailable", {
    status: 503,
    headers: { "Retry-After": "5", "Cache-Control": "no-store" },
  });

export async function handleMarkdownPage(
  section: string,
  handle: string,
): Promise<Response> {
  if (!isShopIndexed() || !isValidHandle(handle)) return notFound();
  try {
    return await markdownPage(section, handle);
  } catch (error) {
    console.warn(
      `[agent-text] ${section} unavailable: ${error instanceof Error ? error.name : typeof error}`,
    );
    return unavailable();
  }
}

async function markdownPage(
  section: string,
  handle: string,
): Promise<Response> {
  const ctx = publicContext();
  if (section === "products") {
    const product = await getProductAtRequest(ctx, handle);
    if (!product) return notFound();
    return markdown(
      productMarkdown(product.content, product.defaultView, site()),
      `/products/${handle}`,
    );
  }
  if (section === "collections") {
    const found = await getCollectionAtRequest(ctx, handle);
    if (!found) return notFound();
    return markdown(
      collectionMarkdown(found.collection, found.listing, site()),
      `/collections/${handle}`,
    );
  }
  if (section === "policies") {
    const policy = await getShopPolicy(ctx, handle);
    return policy
      ? markdown(policyMarkdown(policy, site()), `/policies/${handle}`)
      : notFound();
  }
  return notFound();
}

// Whether a request asks for Markdown rather than HTML.
export function wantsMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const types = accept.split(",").map((part) => {
    const [type, ...params] = part.trim().split(";");
    const q = params.find((p) => p.trim().startsWith("q="));
    return { type: type.trim(), q: q ? Number(q.trim().slice(2)) : 1 };
  });
  const quality = (type: string) => types.find((t) => t.type === type)?.q ?? 0;
  return (
    quality("text/markdown") > 0 &&
    quality("text/markdown") >= quality("text/html")
  );
}

export async function handleLlmsTxt(): Promise<Response> {
  if (!isShopIndexed()) return notFound();
  const ctx = publicContext();
  const url = (path: string) => new URL(path, site()).href;
  const [products, policies] = await Promise.all([
    listProducts(ctx).catch(() => null),
    listShopPolicies(ctx).catch(() => []),
  ]);
  const body = [
    `# ${BRAND.name}`,
    "",
    // Placeholder until the store description is written.
    `> The ${BRAND.name} shop. Product pages show prices and stock (refreshed within minutes); checkout happens on Shopify.`,
    "",
    "Any product, collection or policy page is available as Markdown: request it with `Accept: text/markdown`.",
    "",
    "## Shop",
    "",
    `- [All products](${url("/collections/all")})`,
    ...(products?.items ?? []).map(
      (product) =>
        `- [${product.title}](${url(`/products/${product.handle}`)})`,
    ),
    "",
    "## Policies",
    "",
    ...policies.map(
      (policy) => `- [${policy.title}](${url(`/policies/${policy.handle}`)})`,
    ),
    "",
    "## For agents",
    "",
    `- [Universal Commerce Protocol (MCP)](${url("/api/ucp/mcp")}): catalog search, product details, carts and checkout. Requests need an agent profile (\`meta.ucp-agent.profile\`).`,
    `- [Storefront MCP](${url("/api/mcp")}): store policies and FAQs.`,
    `- [UCP business profile](${url("/.well-known/ucp")}): the store's Universal Commerce Protocol services and capabilities.`,
    "",
  ];
  return text(body.join("\n"), "text/plain");
}
