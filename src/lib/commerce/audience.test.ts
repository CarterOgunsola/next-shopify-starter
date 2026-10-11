import { describe, expect, expectTypeOf, it } from "vitest";
import { toPublicContext } from "./audience";
import type { BuyerContext, PublicContext } from "./types";

describe("toPublicContext", () => {
  it("allows consumers only", () => {
    expect(toPublicContext({ audience: "consumer" })).toEqual({
      audience: "consumer",
    });
    expect(
      toPublicContext({
        audience: "wholesale",
        customerAccessToken: "synthetic",
        companyLocationId: "gid://shopify/CompanyLocation/1",
      }),
    ).toBeNull();
  });

  it("is the only way to get a PublicContext", () => {
    expectTypeOf<{ audience: "consumer" }>().not.toExtend<PublicContext>();
    expectTypeOf<PublicContext>().toExtend<BuyerContext>();
  });
});
