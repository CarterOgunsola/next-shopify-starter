import { BRAND } from "@/lib/brand";
import Link from "next/link";
import { siteMenu } from "@/lib/commerce/menus.server";
import { isShopEnabled } from "@/lib/flags";
import { MenuDisclosure } from "./menu-disclosure";
import { MenuLink } from "./menu-link";
import { CartButton } from "./shop/cart-button";
import { SearchBox } from "./shop/search-box";

// The header: the home link, the Shopify header menu (main-menu, or a
// fallback), then this site's own search, account and cart.
export async function SiteNav() {
  const menu = await siteMenu("header");
  return (
    <nav aria-label="Primary">
      <ul>
        <li>
          <Link href="/">{BRAND.siteName}</Link>
        </li>
        {menu.map((item) => (
          <li key={`${item.title}:${item.url}`}>
            {item.items.length > 0 ? (
              <MenuDisclosure item={item} />
            ) : (
              <MenuLink item={item} />
            )}
          </li>
        ))}
        {isShopEnabled() && (
          <>
            <li>
              <SearchBox />
            </li>
            <li>
              <Link href="/account">Account</Link>
            </li>
            <li>
              <CartButton />
            </li>
          </>
        )}
      </ul>
    </nav>
  );
}
