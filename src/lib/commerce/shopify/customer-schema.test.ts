import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { IntrospectionQuery } from "graphql";
import { describe, expect, it } from "vitest";
import {
  LIVE_SCHEMA_FILE,
  liveSchema,
  validateCustomerDocuments,
} from "./customer-schema";

const root = join(import.meta.dirname, "../../../..");
// An introspection result, with or without the response's data wrapper.
const read = (file: string): IntrospectionQuery => {
  const json = JSON.parse(readFileSync(file, "utf8")) as
    IntrospectionQuery | { data: IntrospectionQuery };
  return "data" in json ? json.data : json;
};
const bundled = () =>
  read(
    join(
      createRequire(join(root, "package.json")).resolve(
        "@shopify/hydrogen/package.json",
      ),
      "../dist/customer-account.schema.json",
    ),
  );

describe("Customer Account documents", () => {
  it("names what a schema without a field rejects", () => {
    const schema = bundled();
    const order = schema.__schema.types.find(
      (t) => t.name === "Order",
    ) as unknown as { fields: { name: string }[] };
    order.fields = order.fields.filter((f) => f.name !== "lineItems");
    const errors = validateCustomerDocuments(liveSchema(schema));
    expect(errors.Orders).toEqual([
      'Cannot query field "lineItems" on type "Order".',
    ]);
    expect(errors.Profile).toEqual([]);
  });

  // The live API's schema (saved from a signed-in dev session with
  // /api/dev/customer-schema?save=1) can differ from Hydrogen's bundled
  // one at the same version.
  it.runIf(existsSync(join(root, LIVE_SCHEMA_FILE)))(
    "are all valid against the live API's schema",
    () => {
      const errors = validateCustomerDocuments(
        liveSchema(read(join(root, LIVE_SCHEMA_FILE))),
      );
      expect(
        Object.entries(errors).filter(([, list]) => list.length > 0),
      ).toEqual([]);
    },
  );
});
