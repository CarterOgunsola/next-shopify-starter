import { formatMoney, purchasePrice } from "./money";
import type {
  Collection,
  Listing,
  ProductContent,
  ShopPolicy,
  VariantView,
} from "./types";

// Markdown versions of product, collection and policy pages, for agents
// that ask for text/markdown, and /llms.txt. Built from the same cached,
// sanitized data as the pages.

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&#x27;": "'",
  "&nbsp;": " ",
};

// Sanitized rich text (see transforms/html.ts) to Markdown: headings,
// paragraphs, lists, links, emphasis and table rows. Anything else is kept
// as its text.
export function htmlToMarkdown(html: string): string {
  return html
    .replace(
      /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi,
      (_, level, text) => `\n\n${"#".repeat(Number(level))} ${text}\n\n`,
    )
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1")
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")
    .replace(/<\/?(strong|b)>/gi, "**")
    .replace(/<\/?(em|i)>/gi, "_")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|ul|ol|table|blockquote)>/gi, "\n\n")
    .replace(/<\/t[dh]>/gi, " | ")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[#\w]+;/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const absolute = (site: string, path: string) => new URL(path, site).href;

export function productMarkdown(
  product: ProductContent,
  view: VariantView | null,
  site: string,
): string {
  const variant = view?.variant;
  const image = product.media.find((media) => media.kind === "image");
  const lines = [
    `# ${product.title}`,
    "",
    `URL: ${absolute(site, `/products/${product.handle}`)}`,
    ...(product.vendor ? [`Brand: ${product.vendor}`] : []),
    ...(variant
      ? [
          `Price: ${formatMoney(
            purchasePrice(
              product.requiresSellingPlan,
              variant.price,
              variant.sellingPlanPrices.map((plan) => plan.price),
            ),
          )}${product.requiresSellingPlan ? " (subscription)" : ""}${variant.available ? "" : " (sold out)"}`,
        ]
      : []),
    ...(product.requiresSellingPlan
      ? ["Purchase: subscription only"]
      : product.sellingPlanGroups.length
        ? ["Purchase: one-time or subscription"]
        : []),
    ...product.options.map(
      (option) =>
        `${option.name}: ${option.values.map((value) => value.name).join(", ")}`,
    ),
    ...(image
      ? ["", `![${image.image.altText ?? product.title}](${image.image.url})`]
      : []),
    "",
    "## Description",
    "",
    htmlToMarkdown(product.descriptionHtml) || product.seo.description,
  ];
  return `${lines.join("\n").trim()}\n`;
}

export function collectionMarkdown(
  collection: Collection,
  listing: Listing,
  site: string,
): string {
  const lines = [
    `# ${collection.title}`,
    "",
    `URL: ${absolute(site, `/collections/${collection.handle}`)}`,
    "",
    ...(collection.descriptionHtml
      ? [htmlToMarkdown(collection.descriptionHtml), ""]
      : []),
    "## Products",
    "",
    ...listing.products.items.map(
      (product) =>
        `- [${product.title}](${absolute(site, `/products/${product.handle}`)}): ${formatMoney(product.price.min)}${product.available ? "" : " (sold out)"}`,
    ),
  ];
  return `${lines.join("\n").trim()}\n`;
}

export function policyMarkdown(policy: ShopPolicy, site: string): string {
  return `# ${policy.title}\n\nURL: ${absolute(site, `/policies/${policy.handle}`)}\n\n${htmlToMarkdown(policy.bodyHtml)}\n`;
}
