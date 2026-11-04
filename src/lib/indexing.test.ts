import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { afterEach, describe, expect, it, vi } from "vitest";
import config from "../../next.config";
import { robotsHeaders } from "./indexing";

afterEach(() => vi.unstubAllEnvs());

const NOINDEX = { key: "X-Robots-Tag", value: "noindex, nofollow" };

describe("X-Robots-Tag", () => {
  it("asks search engines to skip everything until launch", () => {
    for (const value of [undefined, "", "false", "x"]) {
      expect(robotsHeaders({ SITE_INDEXED: value })).toEqual([NOINDEX]);
    }
  });

  it("is gone after launch", () => {
    expect(robotsHeaders({ SITE_INDEXED: "true" })).toEqual([]);
  });

  it("is set on every path of a production build", async () => {
    const everyPath = async () => {
      const rules = await config(PHASE_PRODUCTION_BUILD).headers!();
      return rules.find((rule) => rule.source === "/:path*")?.headers;
    };
    vi.stubEnv("SITE_INDEXED", "");
    expect(await everyPath()).toContainEqual(NOINDEX);
    vi.stubEnv("SITE_INDEXED", "true");
    expect(
      (await everyPath())?.some((header) => header.key === "X-Robots-Tag"),
    ).toBe(false);
  });
});
