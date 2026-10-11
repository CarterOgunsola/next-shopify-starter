import { handleCheckoutRequest } from "@/lib/commerce/checkout.server";

export async function GET(request: Request) {
  return handleCheckoutRequest(request);
}
