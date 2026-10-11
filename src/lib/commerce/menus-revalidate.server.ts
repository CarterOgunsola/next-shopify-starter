import "server-only";
import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { menusRevalidateSecret } from "./config.server";
import { tags } from "./tags";

// POST /api/revalidate/menus with "Authorization: Bearer <secret>": shows
// menu edits from Shopify admin at once (Shopify sends no webhook for
// them; otherwise they refresh hourly). 404 until the secret is set.
export async function handleMenusRevalidate(
  request: Request,
  {
    secret = menusRevalidateSecret(),
    expire = (tag: string) => revalidateTag(tag, { expire: 0 }),
  }: { secret?: string | null; expire?: (tag: string) => void } = {},
): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  if (!secret || request.method !== "POST") {
    return new Response(null, { status: 404, headers });
  }
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  }
  expire(tags.menus);
  return Response.json({ revalidated: tags.menus }, { headers });
}
