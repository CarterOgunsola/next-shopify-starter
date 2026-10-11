import { describe, expect, it, vi } from "vitest";
import { CartNotFoundError } from "../shopify/errors";
import { CartFixtureIdsQuery } from "../shopify/operations/fixture-queries";
import {
  addCartLines,
  createCart,
  fetchCart,
  removeCartLines,
  updateCartLines,
} from "../shopify/operations/cart";
import { storefrontRequest } from "../shopify/client.server";

// Contract test against the dev store: the cart behaves the way the cart
// layer assumes. Leaves an abandoned cart behind. Run with pnpm test:live.

const IP = "203.0.113.7";

// Outside a Next request: no request scope to wait for, and no incoming
// headers or cookies to forward.
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({ get: () => undefined, has: () => false }),
}));

describe("cart contract", () => {
  it("creates, adds, updates and removes by line id", async () => {
    const ids = await storefrontRequest(CartFixtureIdsQuery);
    const wax = ids.wax!.variants.nodes[0].id;
    const plan = ids.wax!.sellingPlanGroups.nodes[0].sellingPlans.nodes[0].id;

    let cart = await createCart([{ merchandiseId: wax, quantity: 1 }], IP);
    expect(cart.lines).toHaveLength(1);

    // The same variant on a plan is its own line.
    cart = await addCartLines(
      cart.id,
      [{ merchandiseId: wax, quantity: 1, sellingPlanId: plan }],
      IP,
    );
    expect(cart.lines).toHaveLength(2);

    // Adding the same one-time variant again merges into its line.
    cart = await addCartLines(
      cart.id,
      [{ merchandiseId: wax, quantity: 1 }],
      IP,
    );
    expect(cart.lines).toHaveLength(2);
    const oneTime = cart.lines.find((line) => !line.sellingPlan)!;
    expect(oneTime.quantity).toBe(2);

    cart = await updateCartLines(
      cart.id,
      [{ id: oneTime.id, quantity: 3 }],
      IP,
    );
    expect(cart.lines.find((line) => line.id === oneTime.id)?.quantity).toBe(3);

    const subscription = cart.lines.find((line) => line.sellingPlan)!;
    cart = await removeCartLines(cart.id, [subscription.id], IP);
    expect(cart.lines.map((line) => line.id)).toEqual([oneTime.id]);

    const reread = await fetchCart(cart.id, IP);
    expect(reread?.totalQuantity).toBe(3);
    expect(new URL(reread!.checkoutUrl).protocol).toBe("https:");
  });

  it("reports an unknown cart as not found", async () => {
    const unknown =
      "gid://shopify/Cart/hWN0000000000000000000000000000000?key=00000000000000000000000000000000";
    expect(await fetchCart(unknown, IP)).toBeNull();
    await expect(
      updateCartLines(
        unknown,
        [{ id: "gid://shopify/CartLine/x", quantity: 1 }],
        IP,
      ),
    ).rejects.toBeInstanceOf(CartNotFoundError);
  });
});
