import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { publicContext } from "@/lib/commerce/audience";
import { getShopPolicy, listShopPolicies } from "@/lib/commerce/catalog.server";
import { isValidHandle } from "@/lib/commerce/handles";
import { isShopEnabled, requireShop } from "@/lib/flags";

// The store's policies from Shopify admin, at Shopify's /policies/<handle>
// paths (refund-policy, shipping-policy, subscription-policy, terms-of-sale,
// terms-of-service, privacy-policy), where checkout and Shopify emails link.
// Static per handle, like product pages, so an unset policy is a real 404.
export const ensureStatic = "navigation";
export const instant = false;

const PLACEHOLDER = [{ handle: "none" }];

export async function generateStaticParams() {
  if (!isShopEnabled()) return PLACEHOLDER;
  const policies = await listShopPolicies(publicContext()).catch(() => []);
  return policies.length
    ? policies.map((policy) => ({ handle: policy.handle }))
    : PLACEHOLDER;
}

async function load(handle: string) {
  if (!isShopEnabled() || !isValidHandle(handle)) return null;
  return getShopPolicy(publicContext(), handle);
}

export async function generateMetadata({
  params,
}: PageProps<"/policies/[handle]">): Promise<Metadata> {
  const policy = await load((await params).handle);
  return policy
    ? {
        title: policy.title,
        alternates: { canonical: `/policies/${policy.handle}` },
      }
    : {};
}

export default async function PolicyPage({
  params,
}: PageProps<"/policies/[handle]">) {
  requireShop();
  const policy = await load((await params).handle);
  if (!policy) notFound();
  return (
    <article>
      <h1>{policy.title}</h1>
      {/* Sanitized in the commerce layer (sanitizeRichText). */}
      <div dangerouslySetInnerHTML={{ __html: policy.bodyHtml }} />
    </article>
  );
}
