import Link from "next/link";
import { ConsentSettingsButton } from "@/components/consent/consent-settings-button";
import { NewsletterSignup } from "@/components/marketing/newsletter-signup";
import { ShopPolicyLinks } from "@/components/shop-policy-links";
import { siteMenu } from "@/lib/commerce/menus.server";
import { serverEnv } from "@/lib/env";
import { withoutFooterCopies } from "./footer-menu";
import { MenuGroup } from "./menu-link";

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
