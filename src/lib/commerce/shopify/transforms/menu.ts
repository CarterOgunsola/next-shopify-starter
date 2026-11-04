import type { MenuItem } from "../../types";
import type { MenuData } from "../operations/menu";

type Link = Pick<MenuData[number], "title" | "type" | "url" | "resource">;

// Shopify's own pages that this site has under its own routes.
const PAGE_ROUTES: Record<string, string> = {
  // Shopify's generated "Your Privacy Choices" page.
  "data-sharing-opt-out": "/privacy-choices",
};

// Where a menu item goes on this site, by Shopify's item type: a path
// here, an absolute URL elsewhere, or null when this site has nothing for
// it (blogs, articles, metaobjects, Shopify pages without a route here).
// hosts: the store's own domains, whose links are this site's paths.
export function menuHref(
  item: Link,
  hosts: string[],
): { url: string; external: boolean } | null {
  const handle =
    item.resource && "handle" in item.resource ? item.resource.handle : null;
  const path = (url: string) => ({ url, external: false });
  switch (item.type) {
    case "FRONTPAGE":
      return path("/");
    case "CATALOG":
    case "COLLECTIONS":
      return path("/shop");
    case "SEARCH":
      return path("/search");
    case "CUSTOMER_ACCOUNT_PAGE":
      return path("/account");
    case "COLLECTION":
      return handle ? path(`/collections/${handle}`) : null;
    case "PRODUCT":
      return handle ? path(`/products/${handle}`) : null;
    case "SHOP_POLICY":
      return handle ? path(`/policies/${handle}`) : null;
    case "PAGE":
      return handle && PAGE_ROUTES[handle] ? path(PAGE_ROUTES[handle]) : null;
    case "HTTP":
      return httpHref(item.url, hosts);
    default:
      return null;
  }
}

// A typed-in link: on the store's own domains it's a path here (without
// any Markets locale prefix); anywhere else stays absolute, http(s) only.
// This site's top-level routes that look like a locale prefix.
const OWN_ROUTES = new Set(["md"]);

function httpHref(
  url: string | null | undefined,
  hosts: string[],
): { url: string; external: boolean } | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return null;
  }
  if (!hosts.includes(parsed.hostname)) {
    return { url: parsed.href, external: true };
  }
  // "#" is how a heading is typed in Shopify, which won't save an item
  // without a link; the Storefront API sends it back as "https://<store>#".
  if (url.endsWith("#") && parsed.pathname === "/" && !parsed.search) {
    return null;
  }
  // A Markets locale prefix (en, en-us), unless it's one of this site's own
  // two-letter routes.
  const locale = /^\/([a-z]{2}(?:-[a-z]{2})?)(?=\/|$)/i.exec(parsed.pathname);
  const pathname =
    (locale && !OWN_ROUTES.has(locale[1].toLowerCase())
      ? parsed.pathname.slice(locale[0].length)
      : parsed.pathname) || "/";
  // "//host" or "/\\host" would leave the site: keep such a link absolute.
  if (/^\/[/\\]/.test(pathname)) {
    return { url: parsed.href, external: true };
  }
  return { url: `${pathname}${parsed.search}${parsed.hash}`, external: false };
}

type Node = Link & { items?: Node[] };

// Items this site can't link to are left out, unless they hold children
// it can (they stay as a heading).
export function toMenu(items: Node[], hosts: string[]): MenuItem[] {
  const known = hosts.filter(Boolean);
  return items.flatMap((item) => {
    const href = menuHref(item, known);
    const children = toMenu(item.items ?? [], known);
    if (!href && children.length === 0) return [];
    return [
      {
        title: item.title,
        url: href?.url ?? null,
        ...(href?.external ? { external: true } : {}),
        items: children,
      },
    ];
  });
}
