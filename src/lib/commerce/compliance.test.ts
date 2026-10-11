import { describe, expect, it } from "vitest";
import {
  allComplianceTexts,
  prop65Warning,
  shareableDescription,
} from "./compliance";

describe("descriptions shared on their own", () => {
  const product = (claims: number | null, supplement = true) => ({
    seo: { description: "Hydration support." },
    supplement: supplement ? { structureFunctionClaims: claims } : null,
  });

  it("leave out a description with claims, or an unknown count", () => {
    expect(shareableDescription(product(0))).toBe("Hydration support.");
    expect(shareableDescription(product(1))).toBeUndefined();
    expect(shareableDescription(product(null))).toBeUndefined();
    expect(shareableDescription(product(null, false))).toBe(
      "Hydration support.",
    );
  });
});

describe("Prop 65 wording", () => {
  it("is never approved without the chemical", () => {
    expect(prop65Warning(null).approved).toBe(false);
    expect(prop65Warning(null).text).toContain("[chemical]");
  });
});

// pnpm launch:check: fails while any wording still waits on legal review.
describe.runIf(process.env.LAUNCH_CHECK === "1")("launch check", () => {
  it.each(allComplianceTexts())("%s is approved", (_, text) => {
    expect(text.approved).toBe(true);
  });
});
