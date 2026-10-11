import { handleBrowseRequest } from "@/lib/commerce/browse-endpoint.server";

export async function GET(request: Request) {
  return handleBrowseRequest(request);
}
