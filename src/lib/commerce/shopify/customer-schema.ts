import type { ShopifyRequestContext } from "@shopify/hydrogen";
import { createCustomerAccountClient } from "@shopify/hydrogen/customer-account";
import {
  buildClientSchema,
  getIntrospectionQuery,
  parse,
  validate,
  type GraphQLSchema,
  type IntrospectionQuery,
} from "graphql";
import { CUSTOMER_DOCUMENTS } from "./operations/customer";

// Hydrogen's bundled Customer Account schema can differ from the live API
// at the same version (it had Order.lineItemsSummary; the live API
// doesn't). The live schema, introspected once from a signed-in dev session
// (/api/dev/customer-schema?save=1), is kept here and every document is
// validated against it in the tests.
export const LIVE_SCHEMA_FILE =
  "src/lib/commerce/shopify/customer-account.live.schema.json";

export function liveSchema(introspection: IntrospectionQuery): GraphQLSchema {
  return buildClientSchema(introspection);
}

// Each operation's validation errors against a schema (empty when it's
// valid). Schema-level messages only: nothing is executed.
export function validateCustomerDocuments(
  schema: GraphQLSchema,
): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(CUSTOMER_DOCUMENTS).map(([name, document]) => [
      name,
      validate(schema, parse(document.source)).map((error) => error.message),
    ]),
  );
}

// The live schema, read with the signed-in customer's token (server-side
// only). data is null when Shopify refused.
export async function introspectCustomerAccount({
  shopId,
  requestContext,
  accessToken,
}: {
  shopId: string;
  requestContext: ShopifyRequestContext;
  accessToken: string;
}): Promise<{
  apiUrl: string;
  status: number;
  data: IntrospectionQuery | null;
}> {
  const { apiUrl } = createCustomerAccountClient({ shopId, requestContext });
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: accessToken,
      "Content-Type": "application/json",
      Origin: new URL(requestContext.url ?? apiUrl).origin,
    },
    body: JSON.stringify({ query: getIntrospectionQuery() }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    data?: IntrospectionQuery;
  } | null;
  return {
    apiUrl,
    status: response.status,
    data: response.ok && body?.data ? body.data : null,
  };
}
