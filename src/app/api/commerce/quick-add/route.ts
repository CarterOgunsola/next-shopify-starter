import { handleQuickAddRequest } from "@/lib/commerce/quick-add-endpoint.server";

export async function GET(request: Request) {
  return handleQuickAddRequest(request);
}
