import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { customerAccount, server } from "./testing/msw";
import { createShopifyRequestContext } from "./shopify/request-context";

const session = vi.hoisted(() => ({ signedIn: true, throws: false }));
vi.mock("./customer-token.server", () => ({
  actionCustomer: async () => {
    if (session.throws) throw new Error("Shopify unreachable");
    return session.signedIn
      ? {
          shopId: "7",
          requestContext: createShopifyRequestContext(
            { country: "US", language: "EN" },
            "https://local.test/account",
          ),
          accessToken: "synthetic-customer-token",
        }
      : null;
  },
}));
vi.mock("@/lib/flags", () => ({ isShopEnabled: () => true }));
const cache = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => cache);

const { makeDefaultAddress, removeAddress, saveAddress, saveProfile } =
  await import("./account.actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const json = (body: unknown) =>
  // A GraphQL body; the resolver types can't infer it from a literal.
  HttpResponse.json(body as { data: Record<string, unknown> }) as never;
const address = {
  firstName: "Avery",
  lastName: "Example",
  company: "",
  address1: "300 Demo Lane",
  address2: "",
  city: "Springfield",
  zoneCode: "il",
  countryCode: "us",
  zip: "62701",
  phoneNumber: "",
};

afterEach(() => {
  session.signedIn = true;
  cache.refresh.mockClear();
  vi.restoreAllMocks();
});

describe("saveProfile", () => {
  it("saves the name and refreshes the page", async () => {
    let input: unknown;
    server.use(
      customerAccount.mutation("CustomerUpdate", ({ variables }) => {
        input = variables.input;
        return json({ data: { customerUpdate: { userErrors: [] } } });
      }),
    );
    const result = await saveProfile(
      null,
      form({ firstName: " Avery ", lastName: "Example" }),
    );
    expect(result).toEqual({ ok: true, message: "Your name was saved." });
    expect(input).toEqual({ firstName: "Avery", lastName: "Example" });
    expect(cache.refresh).toHaveBeenCalled();
  });

  it("puts Shopify's userErrors in our words, on the field", async () => {
    server.use(
      customerAccount.mutation("CustomerUpdate", () =>
        json({
          data: {
            customerUpdate: {
              userErrors: [
                {
                  code: "CONTAINS_URL",
                  field: ["input", "lastName"],
                  message: "x",
                },
              ],
            },
          },
        }),
      ),
    );
    const result = await saveProfile(
      null,
      form({ firstName: "Avery", lastName: "example.test" }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { lastName: "Names can't contain web addresses." },
    });
    expect(cache.refresh).not.toHaveBeenCalled();
  });

  it("rejects markup before calling Shopify", async () => {
    const result = await saveProfile(
      null,
      form({ firstName: "<b>Avery</b>", lastName: "Example" }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { firstName: "Remove the < and > characters." },
    });
  });

  it("asks to sign in again when the session is gone", async () => {
    session.signedIn = false;
    const result = await saveProfile(
      null,
      form({ firstName: "Avery", lastName: "Example" }),
    );
    expect(result).toEqual({
      ok: false,
      error: "Your session ended. Sign in again to make changes.",
      signIn:
        "/account/login?return_to=%2Faccount%2Flink-cart%3Freturn_to%3D%252Faccount%252Fprofile",
      values: { firstName: "Avery", lastName: "Example" },
    });
  });

  it("says the save failed, not that the session ended, when the check throws", async () => {
    session.throws = true;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await saveProfile(
      null,
      form({ firstName: "Avery", lastName: "Example" }),
    );
    expect(result).toMatchObject({
      ok: false,
      error: "That didn't save. Try again.",
    });
    expect(result).not.toHaveProperty("signIn");
    session.throws = false;
  });
});

describe("addresses", () => {
  it("adds an address with upper-case codes", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      customerAccount.mutation("CustomerAddressCreate", ({ variables }) => {
        sent = variables;
        return json({
          data: {
            customerAddressCreate: { customerAddress: null, userErrors: [] },
          },
        });
      }),
    );
    const result = await saveAddress(null, form({ ...address, default: "on" }));
    expect(result).toEqual({ ok: true, message: "Address added." });
    expect(sent).toMatchObject({
      address: { countryCode: "US", zoneCode: "IL" },
      defaultAddress: true,
    });
  });

  it("updates an existing address", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      customerAccount.mutation("CustomerAddressUpdate", ({ variables }) => {
        sent = variables;
        return json({ data: { customerAddressUpdate: { userErrors: [] } } });
      }),
    );
    const result = await saveAddress(
      null,
      form({ ...address, id: "gid://shopify/CustomerAddress/701" }),
    );
    expect(result).toEqual({ ok: true, message: "Address saved." });
    expect(sent).toMatchObject({
      addressId: "gid://shopify/CustomerAddress/701",
    });
    // Never false: that would ask Shopify to demote the default address.
    expect(sent).not.toHaveProperty("defaultAddress");
  });

  it("sends back what was submitted when a save fails", async () => {
    const result = await saveAddress(null, form({ ...address, zip: "<b>" }));
    expect(result).toMatchObject({
      ok: false,
      values: { address1: address.address1, zip: "<b>" },
    });
  });

  it("stores the phone number in E.164 and checks the state belongs to the country", async () => {
    let sent: Record<string, unknown> | undefined;
    server.use(
      customerAccount.mutation("CustomerAddressCreate", ({ variables }) => {
        sent = variables;
        return json({
          data: {
            customerAddressCreate: { customerAddress: null, userErrors: [] },
          },
        });
      }),
    );
    await saveAddress(
      null,
      form({ ...address, phoneNumber: "(312) 555-0123" }),
    );
    expect(sent).toMatchObject({ address: { phoneNumber: "+13125550123" } });

    expect(
      await saveAddress(null, form({ ...address, countryCode: "ca" })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { zoneCode: "Choose a province or territory." },
    });
    expect(
      await saveAddress(null, form({ ...address, phoneNumber: "555-0123" })),
    ).toMatchObject({
      ok: false,
      fieldErrors: { phoneNumber: expect.any(String) },
    });
    expect(
      await saveAddress(
        null,
        form({ ...address, phoneNumber: "312 555 0123 x4" }),
      ),
    ).toMatchObject({
      ok: false,
      fieldErrors: {
        phoneNumber:
          "Leave out the extension: the address can only hold the number.",
      },
    });
  });

  it("validates required fields", async () => {
    const result = await saveAddress(
      null,
      form({ ...address, address1: " ", countryCode: "" }),
    );
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        address1: "Enter the street address.",
        countryCode: "Choose a country.",
      },
    });
  });

  it("explains why the default address can't be deleted", async () => {
    server.use(
      customerAccount.mutation("CustomerAddressDelete", () =>
        json({
          data: {
            customerAddressDelete: {
              deletedAddressId: null,
              userErrors: [
                {
                  code: "DELETING_CUSTOMER_DEFAULT_ADDRESS_NOT_ALLOWED",
                  field: ["addressId"],
                  message: "x",
                },
              ],
            },
          },
        }),
      ),
    );
    const result = await removeAddress("gid://shopify/CustomerAddress/702");
    // The general message: there's no addressId field to highlight.
    expect(result).toEqual({
      ok: false,
      error: "Choose another default address before deleting this one.",
      fieldErrors: {},
    });
  });

  it("deletes and sets the default", async () => {
    server.use(
      customerAccount.mutation("CustomerAddressDelete", () =>
        json({
          data: {
            customerAddressDelete: {
              deletedAddressId: "gid://shopify/CustomerAddress/701",
              userErrors: [],
            },
          },
        }),
      ),
      customerAccount.mutation("CustomerAddressUpdate", ({ variables }) => {
        expect(variables).toEqual({
          addressId: "gid://shopify/CustomerAddress/701",
          defaultAddress: true,
        });
        return json({ data: { customerAddressUpdate: { userErrors: [] } } });
      }),
    );
    expect(await removeAddress("gid://shopify/CustomerAddress/701")).toEqual({
      ok: true,
      message: "Address deleted.",
    });
    expect(
      await makeDefaultAddress("gid://shopify/CustomerAddress/701"),
    ).toEqual({
      ok: true,
      message: "Default address updated.",
    });
  });

  it("refuses an id that isn't an address id", async () => {
    expect(await removeAddress("gid://shopify/Order/1")).toMatchObject({
      ok: false,
    });
  });

  it("answers a Shopify failure without leaking it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      customerAccount.mutation("CustomerAddressDelete", () =>
        HttpResponse.error(),
      ),
    );
    expect(await removeAddress("gid://shopify/CustomerAddress/701")).toEqual({
      ok: false,
      error: "That didn't save. Try again.",
    });
  });
});
