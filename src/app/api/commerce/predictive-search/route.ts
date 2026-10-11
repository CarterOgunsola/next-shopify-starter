import { handlePredictiveRequest } from "@/lib/commerce/browse-endpoint.server";

export async function GET(request: Request) {
  return handlePredictiveRequest(request);
}
