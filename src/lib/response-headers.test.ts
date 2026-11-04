import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";
import {
  builtResponseHeaders,
  RESPONSE_HEADERS_DEFINE,
  withResponseHeaders,
} from "./response-headers";

afterEach(() => vi.unstubAllEnvs());

const HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

describe("response headers", () => {
  it("hands src/proxy.ts the list next.config.ts sets on every path", async () => {
    for (const indexed of ["", "true"]) {
      vi.stubEnv("SITE_INDEXED", indexed);
      const built = config(PHASE_PRODUCTION_BUILD);
      const everyPath = (await built.headers!()).find(
        (rule) => rule.source === "/:path*",
      )?.headers;
      expect(everyPath).toContainEqual(HEADERS[0]);
      const proxied = built.compiler?.defineServer?.[RESPONSE_HEADERS_DEFINE];
      expect(JSON.parse(String(proxied))).toEqual(everyPath);
    }
  });

  it("reads the list the build inlined", () => {
    vi.stubEnv("RESPONSE_HEADERS", JSON.stringify(HEADERS));
    expect(builtResponseHeaders()).toEqual(HEADERS);
  });

  it("adds each header a response lacks, keeping its status and body", async () => {
    const response = withResponseHeaders(
      Response.json({ name: "Synthetic" }, { status: 201 }),
      HEADERS,
    );
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ name: "Synthetic" });
    expect(response.headers.get("content-type")).toBe("application/json");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("leaves a header the response sets itself, so it goes out once", () => {
    const response = withResponseHeaders(
      new Response(null, { headers: { "x-frame-options": "SAMEORIGIN" } }),
      HEADERS,
    );
    expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("adds them to a redirect, whose own headers can't change", () => {
    const response = withResponseHeaders(
      Response.redirect("https://site.example/account", 303),
      HEADERS,
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://site.example/account",
    );
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("keeps each of a response's cookies", () => {
    const headers = new Headers();
    headers.append("Set-Cookie", "a=; Max-Age=0");
    headers.append("Set-Cookie", "b=; Max-Age=0");
    const response = withResponseHeaders(
      new Response(null, { status: 303, headers }),
      HEADERS,
    );
    expect(response.headers.getSetCookie()).toEqual([
      "a=; Max-Age=0",
      "b=; Max-Age=0",
    ]);
  });

  it("returns the response itself when it has them all", () => {
    const response = new Response(null, {
      headers: { "x-frame-options": "DENY", "x-robots-tag": "none" },
    });
    expect(withResponseHeaders(response, HEADERS)).toBe(response);
  });
});
