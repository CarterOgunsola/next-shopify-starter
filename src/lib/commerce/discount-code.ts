import { z } from "zod";

// A discount code as typed or linked: trimmed, no spaces.
export const discountCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^\S+$/);

// Where a ?redirect= or ?return_to= may send the visitor: a path on this
// site only, never another origin. The check runs on the normalized result,
// since dot segments and encodings can turn /.//host into //host.
const BASE = "https://site.invalid";

export function safeRedirectPath(target: string | null): string {
  if (!target || !target.startsWith("/")) return "/";
  try {
    const url = new URL(target, BASE);
    if (url.origin !== BASE) return "/";
    const path = `${url.pathname}${url.search}${url.hash}`;
    if (!path.startsWith("/") || /^\/[/\\]/.test(path)) return "/";
    // Browsers resolve the result again: it must stay on this origin too.
    return new URL(path, BASE).origin === BASE ? path : "/";
  } catch {
    return "/";
  }
}

// The same rule for a redirect Shopify stores: the path, or null when it
// leads anywhere but this site.
export function sameSitePath(target: string): string | null {
  const safe = safeRedirectPath(target);
  return safe === "/" && target !== "/" ? null : safe;
}
