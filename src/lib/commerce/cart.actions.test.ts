import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCartLines, removeCartLines, updateCartLines } from "./cart.actions";

const mocks = vi.hoisted(() => ({
  shopOn: true,
  add: vi.fn(async () => ({ ok: true })),
  update: vi.fn(async () => ({ ok: true })),
  remove: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/flags", () => ({ isShopEnabled: () => mocks.shopOn }));
vi.mock("./buyer.server", () => ({
  getBuyerContext: async () => ({ audience: "consumer" }),
}));
vi.mock("./cart.server", () => ({
  addToCart: mocks.add,
  updateCart: mocks.update,
  removeFromCart: mocks.remove,
}));

const VARIANT = "gid://shopify/ProductVariant/1";
const LINE = "gid://shopify/CartLine/9f386f74-cdbc?cart=hWNabc";

beforeEach(() => {
  mocks.shopOn = true;
  vi.clearAllMocks();
});

describe("cart actions", () => {
  it("pass valid input through", async () => {
    await addCartLines([
      {
        merchandiseId: VARIANT,
        quantity: 2,
        sellingPlanId: "gid://shopify/SellingPlan/3",
      },
    ]);
    await updateCartLines([{ id: LINE, quantity: 0 }]);
    await removeCartLines([LINE]);
    expect(mocks.add).toHaveBeenCalledOnce();
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledOnce();
  });

  it("switch a line's plan without a quantity, but need some change", async () => {
    await updateCartLines([
      { id: LINE, sellingPlanId: "gid://shopify/SellingPlan/3" },
    ]);
    expect(mocks.update).toHaveBeenCalledWith(
      [{ id: LINE, sellingPlanId: "gid://shopify/SellingPlan/3" }],
      expect.anything(),
    );
    expect((await updateCartLines([{ id: LINE }])).ok).toBe(false);
  });

  it.each([
    ["no lines", []],
    [
      "a product id instead of a variant",
      [{ merchandiseId: "gid://shopify/Product/1", quantity: 1 }],
    ],
    ["zero quantity", [{ merchandiseId: VARIANT, quantity: 0 }]],
    ["a huge quantity", [{ merchandiseId: VARIANT, quantity: 1000 }]],
    ["a fractional quantity", [{ merchandiseId: VARIANT, quantity: 1.5 }]],
    ["junk", "x"],
  ])("reject %s", async (_, input) => {
    expect(await addCartLines(input)).toEqual({
      ok: false,
      error: "That request wasn't valid.",
      cart: null,
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("reject line ids that aren't cart lines", async () => {
    expect((await removeCartLines(["gid://shopify/Cart/abc"])).ok).toBe(false);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("do nothing while the shop is closed", async () => {
    mocks.shopOn = false;
    expect(
      await addCartLines([{ merchandiseId: VARIANT, quantity: 1 }]),
    ).toEqual({
      ok: false,
      error: "The shop isn't open yet.",
      cart: null,
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });
});
