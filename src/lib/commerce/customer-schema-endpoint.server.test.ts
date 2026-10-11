import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./customer-token.server", () => ({ sessionTools: async () => null }));

const { handleCustomerSchemaRequest } =
  await import("./customer-schema-endpoint.server");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/dev/customer-schema", () => {
  it("doesn't exist in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await handleCustomerSchemaRequest(
      new Request("https://local.test/api/dev/customer-schema"),
    );
    expect(response.status).toBe(404);
  });

  it("needs a signed-in customer", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const response = await handleCustomerSchemaRequest(
      new Request("https://local.test/api/dev/customer-schema"),
    );
    expect(response.status).toBe(401);
  });
});
