import { handleReviewsRequest } from "@/lib/reviews/endpoint.server";

export async function GET(request: Request) {
  return handleReviewsRequest(request);
}
