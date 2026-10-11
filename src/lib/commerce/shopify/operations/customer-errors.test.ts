import { HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { customerAccount, server } from "../../testing/msw";
import { createShopifyRequestContext } from "../request-context";
import { fetchAccount, refusalText } from "./customer";

const context = () =>
  createShopifyRequestContext(
    { country: "US", language: "EN" },
    "https://local.test:4747/account",
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a failed account read", () => {
  it("logs Shopify's status, request id and the origin sent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      customerAccount.query(
        "Account",
        () =>
          new HttpResponse(null, {
            status: 401,
            headers: { "x-request-id": "synthetic-request-1" },
          }) as never,
      ),
    );
    expect(await fetchAccount("7", context(), "synthetic-token")).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[accounts] account query failed: CustomerAccountApiError, status 401, request synthetic-request-1, origin https://local.test:4747",
    );
  });

  it("logs each GraphQL error's code, path and required access, never its message", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      customerAccount.query(
        "Account",
        () =>
          HttpResponse.json({
            data: { customer: null },
            errors: [
              {
                message: "Access denied for sam@example.test",
                path: ["customer", "orders", "nodes", 0, "statusPageUrl"],
                extensions: {
                  code: "ACCESS_DENIED",
                  requiredAccess: "customer_read_orders",
                },
              },
            ],
          }) as never,
      ),
    );
    expect(await fetchAccount("7", context(), "synthetic-token")).toBeNull();
    const [message] = warn.mock.calls[0];
    expect(message).toBe(
      "[accounts] account query failed: CustomerAccountError, Customer Account Account: ACCESS_DENIED at customer.orders.nodes.[].statusPageUrl (needs customer_read_orders), origin https://local.test:4747",
    );
    expect(message).not.toContain("example.test");
    expect(message).not.toContain("synthetic-token");
  });

  it("logs an answer without a customer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      customerAccount.query(
        "Account",
        () => HttpResponse.json({ data: { customer: null } }) as never,
      ),
    );
    expect(await fetchAccount("7", context(), "synthetic-token")).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[accounts] account query answered no customer.",
    );
  });

  it("logs what Shopify said when it refused the call, without emails or tokens", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      customerAccount.query(
        "Account",
        () =>
          HttpResponse.json(
            {
              errors: [
                {
                  message:
                    "Origin not allowed for sam@example.test with shcat_abc123",
                },
              ],
            },
            { status: 400 },
          ) as never,
      ),
    );
    expect(await fetchAccount("7", context(), "synthetic-token")).toBeNull();
    expect(warn.mock.calls[0][0]).toBe(
      '[accounts] Customer Account API 400 said: {"errors":[{"message":"Origin not allowed for [email] with [token]"}]}',
    );
    expect(warn.mock.calls[1][0]).toMatch(
      /CustomerAccountApiError, status 400/,
    );
  });

  it("keeps only a short, scrubbed refusal", () => {
    expect(refusalText(`a\n  b ${"x".repeat(50)} ${"y".repeat(400)}`)).toBe(
      "a b [token] [token]",
    );
    expect(refusalText("z ".repeat(400)).length).toBe(300);
  });
});
