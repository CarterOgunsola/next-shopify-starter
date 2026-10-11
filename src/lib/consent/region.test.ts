import { describe, expect, it } from "vitest";
import { readCountryCookie } from "./region";

describe("readCountryCookie", () => {
  it("reads the country", () => {
    expect(readCountryCookie("a=1; store_country=US; b=2")).toBe("US");
  });

  it("treats a malformed value as unknown instead of throwing", () => {
    expect(readCountryCookie("store_country=%E0%A4%A")).toBeNull();
  });

  it("is null when the cookie is missing", () => {
    expect(readCountryCookie("a=1")).toBeNull();
  });
});
