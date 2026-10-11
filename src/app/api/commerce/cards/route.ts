import { handleCardsRequest } from "@/lib/commerce/cards-endpoint.server";

export async function GET(request: Request) {
  return handleCardsRequest(request);
}
