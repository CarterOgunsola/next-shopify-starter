import Link from "next/link";
import { ConsentSettingsButton } from "@/components/consent/consent-settings-button";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { ShopPolicyLinks } from "@/components/shop-policy-links";
import type { MenuItem } from "@/lib/commerce";
import { siteMenu } from "@/lib/commerce/menus.server";
import { serverEnv } from "@/lib/env";
import { MenuGroup } from "./menu-link";

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

export async function SiteFooter() {
  const { KLAVIYO_PRIVATE_API_KEY, KLAVIYO_LIST_ID } = serverEnv();
  const newsletterReady = KLAVIYO_PRIVATE_API_KEY && KLAVIYO_LIST_ID;
  const menu = withoutFooterCopies(await siteMenu("footer"));

  return (
    <footer>
      {newsletterReady && <NewsletterSignup source="footer" />}
      {menu.length > 0 && (
        <nav aria-label="Footer">
          <ul>
            {menu.map((item) => (
              <li key={`${item.title}:${item.url}`}>
                <MenuGroup item={item} />
              </li>
            ))}
          </ul>
        </nav>
      )}
      <ShopPolicyLinks />
      <nav aria-label="Legal">
        <ul>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
          <li>
            <Link href="/terms">Terms</Link>
          </li>
          <li>
            <Link href="/cookies">Cookies</Link>
          </li>
          <li>
            <Link href="/privacy-choices">Your Privacy Choices</Link>
          </li>
          <li>
            <ConsentSettingsButton />
          </li>
        </ul>
      </nav>
    </footer>
  );
}
