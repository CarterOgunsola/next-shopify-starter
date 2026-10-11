import { handleRecommendationsRequest } from "@/lib/commerce/recommendations-endpoint.server";

export async function GET(request: Request) {
  return handleRecommendationsRequest(request);
}
