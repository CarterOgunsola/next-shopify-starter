import Link from "next/link";
import { publicContext } from "@/lib/commerce/audience";
import { listShopPolicies } from "@/lib/commerce/catalog.server";
import { isShopEnabled } from "@/lib/flags";

// The store's sales policies for the footer, while the shop is on. The
// site's own Privacy and Terms pages stay the site-wide ones; Shopify's
// privacy policy and terms of service are at /policies/* for checkout's
// links. Nothing renders if Shopify can't be reached.
const FOOTER = [
  "refund-policy",
  "shipping-policy",
  "subscription-policy",
  "terms-of-sale",
];

export async function ShopPolicyLinks() {
  if (!isShopEnabled()) return null;
  const policies = (
    await listShopPolicies(publicContext()).catch(() => [])
  ).filter((policy) => FOOTER.includes(policy.handle));
  if (policies.length === 0) return null;
  return (
    <nav aria-label="Shop policies">
      <ul>
        {policies.map((policy) => (
          <li key={policy.handle}>
            <Link href={`/policies/${policy.handle}`}>{policy.title}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
