import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./env";

afterEach(() => vi.restoreAllMocks());

describe("env parsing", () => {
  it("trims stray whitespace from pasted values", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_GTM_ID: " GTM-ABC123\n",
        NEXT_PUBLIC_SITE_URL: "https://example.test ",
      }),
    ).toMatchObject({
      NEXT_PUBLIC_GTM_ID: "GTM-ABC123",
      NEXT_PUBLIC_SITE_URL: "https://example.test",
    });
    expect(parseServerEnv({ SHOP_ENABLED: "true\n" }).SHOP_ENABLED).toBe(true);
  });

  it("keeps the shop off, with a warning, when SHOP_ENABLED is malformed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseServerEnv({ SHOP_ENABLED: "yes please" }).SHOP_ENABLED).toBe(
      false,
    );
    expect(warn).toHaveBeenCalled();
  });

  it("ignores a malformed vendor value with a warning that hides the value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = parseServerEnv({
      KLAVIYO_PRIVATE_API_KEY: "sk_wrong-format-secret",
    });
    expect(env.KLAVIYO_PRIVATE_API_KEY).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      "[env] KLAVIYO_PRIVATE_API_KEY is malformed and was ignored.",
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain(
      "wrong-format-secret",
    );

    expect(
      parsePublicEnv({ NEXT_PUBLIC_GTM_ID: "not a gtm id" }).NEXT_PUBLIC_GTM_ID,
    ).toBeUndefined();
  });

  it("treats empty values as unset", () => {
    expect(
      parsePublicEnv({ NEXT_PUBLIC_ATTENTIVE_BRAND: "" })
        .NEXT_PUBLIC_ATTENTIVE_BRAND,
    ).toBeUndefined();
  });
});
