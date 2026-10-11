import { handleBuyNowRequest } from "@/lib/commerce/buy-now.server";

export async function POST(request: Request) {
  return handleBuyNowRequest(request);
}
