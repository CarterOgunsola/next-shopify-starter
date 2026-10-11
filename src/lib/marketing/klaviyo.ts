import "server-only";

// Klaviyo subscribe call. The one place that knows Klaviyo's server API.
//
// Bulk subscribe job with the private key, as Klaviyo recommends for server
// calls. One profile per job. 202 means the job was accepted; Klaviyo
// processes it asynchronously.
// https://developers.klaviyo.com/en/reference/bulk_subscribe_profiles
// Key scopes: lists:write, profiles:write, subscriptions:write.

export const KLAVIYO_REVISION = "2026-07-15";

export type SubscribeResult = { ok: true } | { ok: false; status: number };

export async function klaviyoSubscribeEmail({
  apiKey,
  listId,
  email,
  source,
  fetchImpl = fetch,
}: {
  apiKey: string;
  listId: string;
  email: string;
  source: string;
  fetchImpl?: typeof fetch;
}): Promise<SubscribeResult> {
  const response = await fetchImpl(
    "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
    {
      method: "POST",
      headers: {
        authorization: `Klaviyo-API-Key ${apiKey}`,
        "content-type": "application/vnd.api+json",
        accept: "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: "profile-subscription-bulk-create-job",
          attributes: {
            custom_source: source,
            profiles: {
              data: [
                {
                  type: "profile",
                  attributes: {
                    email,
                    subscriptions: {
                      email: { marketing: { consent: "SUBSCRIBED" } },
                    },
                  },
                },
              ],
            },
          },
          relationships: {
            list: { data: { type: "list", id: listId } },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  return response.status === 202
    ? { ok: true }
    : { ok: false, status: response.status };
}

// A back-in-stock subscription for one Shopify variant: Klaviyo emails the
// address once when the variant is back (a transactional alert, not
// marketing). Needs Klaviyo's Shopify catalog sync and a Back in Stock
// flow. 202 means accepted.
// https://developers.klaviyo.com/en/docs/how_to_set_up_custom_back_in_stock
// Key scopes: catalogs:write, profiles:write.
export async function klaviyoBackInStock({
  apiKey,
  email,
  variantId,
  fetchImpl = fetch,
}: {
  apiKey: string;
  email: string;
  // Shopify's numeric variant id.
  variantId: string;
  fetchImpl?: typeof fetch;
}): Promise<SubscribeResult> {
  const response = await fetchImpl(
    "https://a.klaviyo.com/api/back-in-stock-subscriptions",
    {
      method: "POST",
      headers: {
        authorization: `Klaviyo-API-Key ${apiKey}`,
        "content-type": "application/vnd.api+json",
        accept: "application/vnd.api+json",
        revision: KLAVIYO_REVISION,
      },
      body: JSON.stringify({
        data: {
          type: "back-in-stock-subscription",
          attributes: {
            channels: ["EMAIL"],
            profile: { data: { type: "profile", attributes: { email } } },
          },
          relationships: {
            variant: {
              data: {
                type: "catalog-variant",
                id: `$shopify:::$default:::${variantId}`,
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );
  return response.status === 202
    ? { ok: true }
    : { ok: false, status: response.status };
}
