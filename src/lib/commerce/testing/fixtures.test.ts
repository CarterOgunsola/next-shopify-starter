import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TEST_STORE_DOMAIN } from "./msw";
import {
  SYNTHETIC_FILES_PATH,
  SYNTHETIC_SHOP_ID,
  SYNTHETIC_VALUE,
  synthesize,
} from "./synthesize";

// Every recorded or hand-written fixture: commerce and reviews.
const DIRS = [
  join(import.meta.dirname, "fixtures"),
  join(import.meta.dirname, "../../reviews/fixtures"),
];
const files = DIRS.flatMap((dir) =>
  readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".json"))
    .map((name) => [name, readFileSync(join(dir, name), "utf8")] as const),
);

// Documentation addresses (RFC 5737) and example domains only.
const DOCUMENTATION_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.\d{1,3}$/;

describe("fixtures", () => {
  it.each(files)("%s holds only synthetic store values", (_, json) => {
    for (const host of json.match(/[\w-]+\.myshopify\.com/g) ?? []) {
      expect(host).toBe(TEST_STORE_DOMAIN);
    }
    // Whole values, not just their start.
    const values = [
      ...[...json.matchAll(/(?:Cart\/|\/cart\/c\/)([^?&#/"\s\\]+)/g)],
      ...[...json.matchAll(/[?&](?:key|cart|_s|_y)=([^?&#/"\s\\]+)/g)],
    ].map((match) => match[1]);
    for (const value of values) expect(value).toMatch(SYNTHETIC_VALUE);
    // The shop's id, also in its CDN file paths.
    for (const [shop] of json.matchAll(/gid:\/\/shopify\/Shop\/\d+/g)) {
      expect(shop).toBe(`gid://shopify/Shop/${SYNTHETIC_SHOP_ID}`);
    }
    for (const [path] of json.matchAll(
      /\/s\/files\/1\/\d{4}\/\d{4}\/\d{4}\//g,
    )) {
      expect(path).toBe(SYNTHETIC_FILES_PATH);
    }
    // No real person's email address or IP.
    for (const [email] of json.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) {
      expect(email).toMatch(/@example\.(test|com)$/);
    }
    for (const [ip] of json.matchAll(/\b\d{1,3}(\.\d{1,3}){3}\b/g)) {
      expect(ip).toMatch(DOCUMENTATION_IP);
    }
  });
});

describe("SYNTHETIC_VALUE", () => {
  it("accepts only a whole stand-in", () => {
    expect("syntheticKey0123456789ab").toMatch(SYNTHETIC_VALUE);
    expect("synthetic").toMatch(SYNTHETIC_VALUE);
    for (const leaky of [
      "syntheticKey0123456789ab-1tVzB_UBEsc",
      "syntheticKey0123456789abX",
      "synthetic-real",
      "hWNHabc",
    ]) {
      expect(leaky).not.toMatch(SYNTHETIC_VALUE);
    }
  });
});

describe("synthesize", () => {
  it("replaces the shop's id, in its gid and its CDN file paths", () => {
    const json = synthesize(
      JSON.stringify({
        id: "gid://shopify/Shop/55512345678",
        image:
          "https://cdn.shopify.com/s/files/1/0555/1234/5678/files/a.jpg?v=1",
      }),
      "real-shop-01.myshopify.com",
    );
    expect(json).not.toMatch(/55512345678|0555\/1234\/5678/);
    expect(json).toContain("gid://shopify/Shop/1");
    expect(json).toContain("/s/files/1/0000/0000/0001/files/a.jpg");
  });

  it("replaces the store, cart tokens, keys and visitor ids whole, the same way every time", () => {
    const raw = JSON.stringify({
      vendor: "real-shop-01",
      id: "gid://shopify/Cart/hWNAbc123?key=9f8e-7d_X.1",
      line: "gid://shopify/CartLine/0b1c-2d?cart=hWNAbc123",
      checkoutUrl:
        "https://real-shop-01.myshopify.com/cart/c/hWNAbc123?key=9f8e-7d_X.1&_s=s-1_2&_y=y-3_4",
    });
    const json = synthesize(raw, "real-shop-01.myshopify.com");
    for (const real of [
      "real-shop",
      "hWNAbc123",
      "9f8e",
      "7d_X",
      "s-1_2",
      "y-3_4",
    ]) {
      expect(json).not.toContain(real);
    }
    const out = JSON.parse(json);
    expect(out.vendor).toBe("synthetic-store");
    const [, token, key] =
      /^gid:\/\/shopify\/Cart\/(syntheticCart[0-9a-f]{12})\?key=(syntheticKey[0-9a-f]{12})$/.exec(
        out.id,
      )!;
    expect(out.line).toBe(`gid://shopify/CartLine/0b1c-2d?cart=${token}`);
    expect(out.checkoutUrl).toMatch(
      new RegExp(
        `^https://${TEST_STORE_DOMAIN}/cart/c/${token}\\?key=${key}&_s=syntheticS[0-9a-f]{12}&_y=syntheticY[0-9a-f]{12}$`,
      ),
    );
  });
});
