import type { MenuItem } from "@/lib/commerce";

// This site's legal links and the store's policies are always shown below;
// the Shopify footer menu's copies of them are left out, at every level (a
// heading left with nothing under it goes too).
const LEGAL = ["/privacy", "/terms", "/cookies", "/privacy-choices"];

const shownBelow = (url: string | null) =>
  !!url && (LEGAL.includes(url) || url.startsWith("/policies/"));

export function withoutFooterCopies(items: MenuItem[]): MenuItem[] {
  return items.flatMap((item) => {
    if (shownBelow(item.url)) return [];
    const children = withoutFooterCopies(item.items);
    if (!item.url && children.length === 0) return [];
    return [{ ...item, items: children }];
  });
}
