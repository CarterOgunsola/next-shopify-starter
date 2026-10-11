import "server-only";
import { isShopEnabled } from "@/lib/flags";
import { browse, predictiveSearch } from "./browse.server";
import { publicContext } from "./audience";
import { getBuyerContext } from "./buyer.server";
import { isPublishedCollection } from "./catalog.server";
import { isTemporaryFailure } from "./errors";
import { isValidHandle } from "./handles";
import { ShopifyRequestError } from "./shopify/errors";

// GET /api/commerce/browse?collection=<handle>|q=<term>&<filter params>
// GET /api/commerce/predictive-search?q=<term>
// Listings for the static collection and search pages, loaded in the
// browser. Never cached.

const NO_STORE = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

type Deps = { shopEnabled?: () => boolean };

function searchTerm(value: string | null, max: number): string | null {
  const term = value?.trim() ?? "";
  return term.length > 0 && term.length <= max ? term : null;
}

async function guard<T>(run: () => Promise<T>): Promise<Response> {
  try {
    const body = await run();
    return body === null ? json({ error: "not_found" }, 404) : json(body);
  } catch (error) {
    if (isTemporaryFailure(error)) {
      return Response.json(
        { error: "unavailable" },
        { status: 503, headers: { ...NO_STORE, "Retry-After": "5" } },
      );
    }
    // A GraphQL error (no HTTP error) means Shopify rejected what the URL
    // asked for, such as a malformed filter. Retrying won't help.
    if (error instanceof ShopifyRequestError && error.status === undefined) {
      return json({ error: "bad_request" }, 400);
    }
    throw error;
  }
}

export async function handleBrowseRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: Deps = {},
): Promise<Response> {
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const url = new URL(request.url);
  const collection = url.searchParams.get("collection");
  const query = searchTerm(url.searchParams.get("q"), 200);
  if (collection !== null && !isValidHandle(collection)) {
    return json({ error: "bad_request" }, 400);
  }
  if (collection === null && query === null) {
    return json({ error: "bad_request" }, 400);
  }
  const source = collection !== null ? { collection } : { query: query! };
  return guard(async () => {
    if (
      collection !== null &&
      !(await isPublishedCollection(publicContext(), collection))
    )
      return null;
    return browse(source, url.searchParams.toString(), await getBuyerContext());
  });
}

export async function handlePredictiveRequest(
  request: Request,
  { shopEnabled = isShopEnabled }: Deps = {},
): Promise<Response> {
  if (!shopEnabled()) return json({ error: "not_found" }, 404);
  const query = searchTerm(new URL(request.url).searchParams.get("q"), 100);
  if (query === null)
    return json({ products: [], collections: [], queries: [] });
  return guard(async () => predictiveSearch(query, await getBuyerContext()));
}
