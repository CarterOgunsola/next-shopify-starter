import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

// WCAG 2.2 A and AA, for every test that runs axe.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// Every violation on the page, as "rule: targets". Target size (24px, WCAG
// 2.5.8) is skipped only inside [data-tight-targets]: mark a part whose
// rows are smaller by design choice, and everything else is still held to
// it.
export async function accessibilityViolations(page: Page): Promise<string[]> {
  const all = await new AxeBuilder({ page })
    .withTags(TAGS)
    .disableRules(["target-size"])
    .analyze();
  const targets = await new AxeBuilder({ page })
    .withRules(["target-size"])
    .exclude("[data-tight-targets]")
    .analyze();
  return [...all.violations, ...targets.violations].map(
    (v) => `${v.id}: ${v.nodes.map((n) => n.target).join(" ")}`,
  );
}
