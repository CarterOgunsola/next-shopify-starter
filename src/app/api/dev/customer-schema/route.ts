import { handleCustomerSchemaRequest } from "@/lib/commerce/customer-schema-endpoint.server";

// Development only (404 in production builds).
export async function GET(request: Request) {
  return handleCustomerSchemaRequest(request);
}
