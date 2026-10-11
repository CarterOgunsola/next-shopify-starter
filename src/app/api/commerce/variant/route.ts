import { handleVariantRequest } from "@/lib/commerce/variant-endpoint.server";

export async function POST(request: Request) {
  return handleVariantRequest(request);
}
