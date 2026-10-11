import { describe, expect, it, vi } from "vitest";
import { KLAVIYO_REVISION, klaviyoSubscribeEmail } from "./klaviyo";

describe("klaviyoSubscribeEmail", () => {
  it("posts a bulk subscribe job with the private key and reads 202 as success", async () => {
    const fetchImpl = vi.fn(
      async () => new Response(null, { status: 202 }),
    ) as unknown as typeof fetch;

    const result = await klaviyoSubscribeEmail({
      apiKey: "pk_synthetic",
      listId: "List01",
      email: "test.subscriber@example.com",
      source: "Example footer",
      fetchImpl,
    });

    expect(result).toEqual({ ok: true });
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0];
    expect(url).toBe(
      "https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs",
    );
    expect(init?.headers).toMatchObject({
      authorization: "Klaviyo-API-Key pk_synthetic",
      revision: KLAVIYO_REVISION,
    });
    const body = JSON.parse(String(init?.body));
    expect(body.data.type).toBe("profile-subscription-bulk-create-job");
    expect(body.data.relationships.list.data.id).toBe("List01");
    const [profile] = body.data.attributes.profiles.data;
    expect(profile.attributes.email).toBe("test.subscriber@example.com");
    expect(profile.attributes.subscriptions.email.marketing.consent).toBe(
      "SUBSCRIBED",
    );
  });

  it("returns the status on failure", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 400 }),
    ) as unknown as typeof fetch;
    expect(
      await klaviyoSubscribeEmail({
        apiKey: "pk_synthetic",
        listId: "List01",
        email: "test.subscriber@example.com",
        source: "Example footer",
        fetchImpl,
      }),
    ).toEqual({ ok: false, status: 400 });
  });
});
