import { gql } from "@shopify/hydrogen";
import { describe, expect, it, vi } from "vitest";
import { storefrontRequest } from "./client.server";
import { ShopifyTransientError } from "./errors";
import { STOREFRONT_ENDPOINT } from "../testing/msw";

describe("test network guard", () => {
  it("fails Shopify operations that have no handler", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const Unhandled = gql(`query Unhandled { shop { name } }`);
    await expect(storefrontRequest(Unhandled)).rejects.toBeInstanceOf(
      ShopifyTransientError,
    );
  });

  it("fails plain requests that have no handler", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      fetch(STOREFRONT_ENDPOINT, { method: "POST", body: "{}" }),
    ).rejects.toThrow();
    await expect(fetch("https://example.com/")).rejects.toThrow();
  });
});
