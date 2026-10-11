import {
  type ComplianceText,
  DAILY_VALUE_NOT_ESTABLISHED,
  dsheaDisclaimer,
  PLACEHOLDER_MARKER,
  prop65Warning,
} from "./compliance";
import { formatMoney, purchasePrice } from "./money";
import { factGroups } from "./supplement-facts";
import type {
  Collection,
  Listing,
  ProductContent,
  ShopPolicy,
  SupplementInfo,
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
  const dshea = product.supplement
    ? dsheaDisclaimer(product.supplement.structureFunctionClaims)
    : null;
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
    // Before anything else about buying it, as on the page.
    ...(product.prop65
      ? ["", notice(prop65Warning(product.prop65.chemical))]
      : []),
    "",
    "## Description",
    "",
    htmlToMarkdown(product.descriptionHtml) || product.seo.description,
    // Right after the description, which holds the claims.
    ...(dshea ? ["", `\\* ${notice(dshea)}`] : []),
    ...(product.supplement ? ["", supplementMarkdown(product.supplement)] : []),
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
    // A Prop 65 product says so in the listing too: the warning itself is
    // on its page, before any purchase.
    ...listing.products.items.map(
      (product) =>
        `- [${product.title}](${absolute(site, `/products/${product.handle}`)}): ${formatMoney(product.price.min)}${product.available ? "" : " (sold out)"}${product.prop65 ? " (California Prop 65 warning: see the product page)" : ""}`,
    ),
  ];
  return `${lines.join("\n").trim()}\n`;
}

export function policyMarkdown(policy: ShopPolicy, site: string): string {
  return `# ${policy.title}\n\nURL: ${absolute(site, `/policies/${policy.handle}`)}\n\n${htmlToMarkdown(policy.bodyHtml)}\n`;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");
const notice = (text: ComplianceText) =>
  `${text.approved ? "" : `[${PLACEHOLDER_MARKER}] `}${text.text}`;

// The label content as on the page: facts table, ingredients, allergens,
// directions, warnings and the notices that go with them.
export function supplementMarkdown(info: SupplementInfo): string {
  const lines = ["## Supplement Facts", ""];
  if (info.servingSize) lines.push(`Serving size: ${info.servingSize}`);
  if (info.servingsPerContainer) {
    lines.push(`Servings per container: ${info.servingsPerContainer}`);
  }
  if (info.facts.length) {
    lines.push(
      "",
      "| Ingredient | Amount per serving | % Daily Value |",
      "| --- | --- | --- |",
      ...factGroups(info.facts).flatMap((group) => [
        // A blend's name with its total, then its ingredients.
        ...(group.blend
          ? [
              `| ${cell(group.blend)} | ${cell(group.total ?? "")} | ${group.total ? "†" : ""} |`,
            ]
          : []),
        ...group.rows.map(
          (row) =>
            `| ${cell(`${row.blend ? `${row.blend}: ` : ""}${row.ingredient}${row.source ? ` (as ${row.source})` : ""}`)} | ${cell(`${row.amount}${row.unit ? ` ${row.unit}` : ""}`)} | ${row.dailyValue === null ? "†" : `${row.dailyValue}%`} |`,
        ),
      ]),
    );
    // Also for a blend's total, which has no Daily Value.
    if (info.facts.some((row) => row.dailyValue === null || row.blendTotal)) {
      lines.push("", `† ${DAILY_VALUE_NOT_ESTABLISHED}`);
    }
  }
  if (info.otherIngredients.length) {
    lines.push("", `Other ingredients: ${info.otherIngredients.join(", ")}.`);
  }
  if (info.allergens.length) {
    lines.push("", `Contains: ${info.allergens.join(", ")}.`);
  }
  if (info.directions) lines.push("", "### Directions", "", info.directions);
  if (info.warnings) lines.push("", "### Warnings", "", info.warnings);
  return lines.join("\n");
}
