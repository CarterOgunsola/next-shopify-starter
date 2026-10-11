import "server-only";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sessionTools } from "./customer-token.server";
import { getShopId } from "./shopify/customer-session.server";
import {
  introspectCustomerAccount,
  LIVE_SCHEMA_FILE,
  liveSchema,
  validateCustomerDocuments,
} from "./shopify/customer-schema";

// Development only: introspects the live Customer Account API with the
// signed-in customer's token (server-side; it never reaches the response)
// and reports which of this site's documents it rejects. ?save=1 also
// writes the schema (types only, no customer data) to LIVE_SCHEMA_FILE.
export async function handleCustomerSchemaRequest(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  const tools = await sessionTools();
  const token = tools
    ? await tools.customerSession.getAccessToken(
        tools.manager,
        tools.requestContext,
      )
    : undefined;
  if (!tools || !token) {
    return Response.json(
      {
        error: "Sign in at /account first (reload it if the session expired).",
      },
      { status: 401 },
    );
  }
  const { apiUrl, status, data } = await introspectCustomerAccount({
    shopId: await getShopId(),
    requestContext: tools.requestContext,
    accessToken: token,
  });
  if (!data) {
    return Response.json(
      { error: `Introspection failed (${status}).` },
      { status: 502 },
    );
  }
  const operations = validateCustomerDocuments(liveSchema(data));
  const save = new URL(request.url).searchParams.get("save") === "1";
  if (save) {
    await writeFile(
      join(process.cwd(), LIVE_SCHEMA_FILE),
      `${JSON.stringify({ data })}\n`,
    );
  }
  return Response.json(
    {
      apiUrl: apiUrl.replace(/\/\d+\//, "/<shop>/"),
      valid: Object.values(operations).every((errors) => errors.length === 0),
      operations,
      ...(save ? { saved: LIVE_SCHEMA_FILE } : {}),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
