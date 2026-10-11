import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isShopEnabled } from "@/lib/flags";
import { commerceEnv, webhookSecret } from "./config.server";
import { tags } from "./tags";

// POST /api/webhooks/shopify: expires the cached pages a store change
// affects. Shopify retries anything but a 2xx within 5 seconds, so the work
// here is small: verify, dedupe, expire tags, answer.

export function verifyHmac(
  rawBody: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const resource = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  handle: z.string().optional(),
});

const metaobject = z.object({ type: z.string() });

// Cache tags to expire for a topic. Deletes only carry the id, which is why
// every cached product and collection read is tagged by id as well.
export function tagsForWebhook(topic: string, payload: unknown): string[] {
  const [subject] = topic.split("/");
  if (subject === "products" || subject === "collections") {
    const parsed = resource.safeParse(payload);
    if (!parsed.success) return [];
    const { id, handle } = parsed.data;
    return subject === "products"
      ? [
          tags.productId(id),
          ...(handle ? [tags.product(handle)] : []),
          tags.productsIndex,
        ]
      : [
          tags.collectionId(id),
          ...(handle ? [tags.collection(handle)] : []),
          tags.collectionsIndex,
        ];
  }
  if (topic === "shop/update") return [tags.shop];
  if (subject === "metaobjects") {
    const parsed = metaobject.safeParse(payload);
    return parsed.success ? [tags.metaobject(parsed.data.type)] : [];
  }
  return [];
}

// Webhook ids seen recently, per server instance. Shopify can deliver the
// same webhook more than once; expiring a tag twice is harmless, so this
// only saves work and doesn't need to be shared between instances.
// An id is recorded only once its work is done, so a delivery that failed
// halfway is handled again when Shopify retries it.
export type SeenIds = { has(id: string): boolean; add(id: string): void };

export function createSeenIds({
  ttlMs = 60 * 60 * 1000,
  max = 5000,
  now = Date.now,
} = {}): SeenIds {
  const seen = new Map<string, number>();
  const prune = (time: number) => {
    for (const [key, at] of seen) {
      if (time - at < ttlMs && seen.size <= max) break;
      seen.delete(key);
    }
  };
  return {
    has(id) {
      const time = now();
      prune(time);
      const at = seen.get(id);
      return at !== undefined && time - at < ttlMs;
    },
    add(id) {
      const time = now();
      prune(time);
      seen.set(id, time);
    },
  };
}

const alreadySeen = createSeenIds();

export type WebhookDeps = {
  shopEnabled?: () => boolean;
  // Env is read only once the shop is on.
  secret?: () => string | null;
  // Read only after the signature checks out.
  storeDomain?: () => string;
  expire?: (tag: string) => void;
  seen?: SeenIds;
};

export async function handleShopifyWebhook(
  request: Request,
  {
    shopEnabled = isShopEnabled,
    secret: readSecret = webhookSecret,
    storeDomain = () => commerceEnv().storeDomain,
    expire = (tag) => revalidateTag(tag, { expire: 0 }),
    seen = alreadySeen,
  }: WebhookDeps = {},
): Promise<Response> {
  // Off: nothing is cached from Shopify, and the store env may be unset.
  if (!shopEnabled()) return new Response(null, { status: 404 });
  const secret = readSecret();
  if (!secret) {
    console.warn("[webhooks] SHOPIFY_WEBHOOK_SECRET is not set; refused.");
    return new Response(null, { status: 401 });
  }
  const body = await request.text();
  if (!verifyHmac(body, request.headers.get("x-shopify-hmac-sha256"), secret)) {
    return new Response(null, { status: 401 });
  }
  if (request.headers.get("x-shopify-shop-domain") !== storeDomain()) {
    return new Response(null, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response(null, { status: 400 });
  }
  const id = request.headers.get("x-shopify-webhook-id");
  if (id && seen.has(id)) return new Response(null, { status: 200 });

  const topic = request.headers.get("x-shopify-topic") ?? "";
  const expired = tagsForWebhook(topic, payload);
  for (const tag of expired) expire(tag);
  if (id) seen.add(id);
  // Topic and tags only: payloads can hold customer data.
  console.info(
    `[webhooks] ${topic}: expired ${expired.join(", ") || "nothing"}`,
  );
  return new Response(null, { status: 200 });
}
