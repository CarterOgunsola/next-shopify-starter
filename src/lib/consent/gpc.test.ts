import { describe, expect, it } from "vitest";
import { gpcFromHeader, readGpc } from "./gpc";

describe("readGpc", () => {
  it("is true only when the browser sets globalPrivacyControl to true", () => {
    expect(readGpc({ globalPrivacyControl: true })).toBe(true);
    expect(readGpc({ globalPrivacyControl: false })).toBe(false);
    expect(readGpc({})).toBe(false);
    expect(readGpc(undefined)).toBe(false);
  });
});

describe("gpcFromHeader", () => {
  it("reads Sec-GPC: 1", () => {
    expect(gpcFromHeader("1")).toBe(true);
    expect(gpcFromHeader("0")).toBe(false);
    expect(gpcFromHeader(null)).toBe(false);
  });
});
