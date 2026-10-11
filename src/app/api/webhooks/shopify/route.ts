import { handleShopifyWebhook } from "@/lib/commerce/webhooks.server";

export async function POST(request: Request) {
  return handleShopifyWebhook(request);
}
