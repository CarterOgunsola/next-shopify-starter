import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { publicContext } from "./audience";
import { getMenu } from "./catalog.server";
import type { MenuItem } from "./types";

// The header and footer menus: Shopify's Navigation menus by handle (the
// ones every store starts with), or these links when a menu is missing or
// empty, Shopify can't be reached, or the shop is off.
export const MENU_HANDLES = { header: "main-menu", footer: "footer" } as const;

const FALLBACK: Record<keyof typeof MENU_HANDLES, MenuItem[]> = {
  header: [{ title: "Shop", url: "/shop", items: [] }],
  footer: [
    { title: "Shop", url: "/shop", items: [] },
    { title: "Search", url: "/search", items: [] },
  ],
};

export async function siteMenu(
  which: keyof typeof MENU_HANDLES,
  { shopEnabled = isShopEnabled }: { shopEnabled?: () => boolean } = {},
): Promise<MenuItem[]> {
  if (!shopEnabled()) return [];
  return (
    (await getMenu(publicContext(), MENU_HANDLES[which])) ?? FALLBACK[which]
  );
}
