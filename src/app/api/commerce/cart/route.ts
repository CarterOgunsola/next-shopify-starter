import { handleCartRequest } from "@/lib/commerce/cart-endpoint.server";

export async function GET() {
  return handleCartRequest();
}
