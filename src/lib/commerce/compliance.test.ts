import { describe, expect, it } from "vitest";
import { allComplianceTexts } from "./compliance";

// pnpm launch:check: fails while any wording still waits on legal review.
describe.runIf(process.env.LAUNCH_CHECK === "1")("launch check", () => {
  it.each(allComplianceTexts())("%s is approved", (_, text) => {
    expect(text.approved).toBe(true);
  });
});
