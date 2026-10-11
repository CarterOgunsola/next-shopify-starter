import "server-only";
import { notFound, permanentRedirect } from "next/navigation";
import { publicContext } from "./audience";
import { getShopifyRedirect } from "./catalog.server";

// For a static product or collection page whose handle doesn't exist: the
// Shopify URL redirect for its path if there is one (an old handle), else
// the 404. Cached, so it works in a static render.
export async function redirectOrNotFound(path: string): Promise<never> {
  // Only paths a Shopify handle could make are looked up.
  if (!/^\/(products|collections)\/[\p{L}\p{N}_-]{1,255}$/u.test(path))
    notFound();
  const target = await getShopifyRedirect(publicContext(), path).catch(
    () => null,
  );
  if (target && target !== path) permanentRedirect(target);
  notFound();
}
