// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { SupplementInfo } from "@/lib/commerce";
import { productJsonLd } from "@/lib/commerce/structured-data";
import { productMarkdown } from "@/lib/commerce/markdown";
import { productContent } from "@/lib/commerce/testing/factories";
import {
  DsheaDisclaimer,
  Prop65Notice,
  SupplementFacts,
} from "./supplement-facts";

afterEach(cleanup);

const info: SupplementInfo = {
  servingSize: "1 scoop (6 g)",
  servingsPerContainer: 30,
  facts: [
    {
      ingredient: "Sodium",
      amount: "500",
      unit: "mg",
      dailyValue: 22,
      source: "sodium citrate",
      blend: null,
      blendTotal: null,
    },
    {
      ingredient: "Taurine",
      amount: "250",
      unit: "mg",
      dailyValue: null,
      source: null,
      blend: "Hydration blend",
      blendTotal: "350 mg",
    },
    {
      ingredient: "Coconut water powder",
      amount: "100",
      unit: "mg",
      dailyValue: null,
      source: null,
      blend: "Hydration blend",
      blendTotal: null,
    },
  ],
  otherIngredients: ["Citric acid", "Natural flavor"],
  allergens: ["Milk"],
  directions: "Mix one scoop with 16 oz of water.",
  warnings: "Keep out of reach of children.",
  structureFunctionClaims: 1,
  labelImage: null,
};

describe("SupplementFacts", () => {
  it("renders the panel as a real table", () => {
    render(<SupplementFacts info={info} />);
    const table = screen.getByRole("table", {
      name: "Supplement Facts, per serving (1 scoop (6 g))",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(["Ingredient", "Amount per serving", "% Daily Value"]);
    const sodium = within(table).getByRole("rowheader", {
      name: "Sodium (as sodium citrate)",
    });
    expect(sodium.closest("tr")?.textContent).toContain("500 mg22%");
    // The blend heads its rows, with its total (21 CFR 101.36(c)(2)).
    expect(
      within(table)
        .getByRole("rowheader", { name: "Hydration blend" })
        .closest("tr")?.textContent,
    ).toBe("Hydration blend350 mg† Daily Value not established.");
    // No Daily Value: a dagger with its meaning, and the footnote.
    expect(
      within(table).getAllByText("Daily Value not established.", {
        exact: false,
      }),
    ).toHaveLength(3);
    expect(screen.getByText("† Daily Value not established.")).toBeTruthy();
  });

  it("lists ingredients, allergens, directions and warnings", () => {
    render(<SupplementFacts info={info} />);
    expect(screen.getByText("Citric acid, Natural flavor.")).toBeTruthy();
    expect(screen.getByText("Contains:").parentElement?.textContent).toBe(
      "Contains: Milk.",
    );
    expect(screen.getByRole("heading", { name: "Directions" })).toBeTruthy();
    expect(screen.getByText("Keep out of reach of children.")).toBeTruthy();
  });

  it("shows the Prop 65 warning, marked as a placeholder until approved", () => {
    render(<Prop65Notice prop65={{ chemical: "lead" }} />);
    const warning = screen.getByLabelText("California Proposition 65 warning");
    expect(warning.textContent).toMatch(
      /^\[Placeholder, pending legal review\] WARNING: .*including lead/,
    );
  });

  it("leaves out what isn't there", () => {
    render(
      <SupplementFacts
        info={{
          ...info,
          facts: [],
          allergens: [],
          warnings: null,
        }}
      />,
    );
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByText("Contains:")).toBeNull();
    expect(screen.queryByLabelText(/Proposition 65/)).toBeNull();
  });
});

describe("DsheaDisclaimer", () => {
  it.each([
    [1, /^\* \[Placeholder, pending legal review\] This statement has not/],
    [3, /^\* \[Placeholder, pending legal review\] These statements have not/],
    // Count unknown: fails closed, with the plural.
    [
      null,
      /^\* \[Placeholder, pending legal review\] These statements have not/,
    ],
  ])("uses the exact wording for %i claim(s)", (claims, wording) => {
    const { container } = render(<DsheaDisclaimer claims={claims} />);
    expect(container.textContent).toMatch(wording);
  });

  it("shows nothing without claims", () => {
    const { container } = render(<DsheaDisclaimer claims={0} />);
    expect(container.textContent).toBe("");
  });
});

describe("supplement content for agents and search engines", () => {
  const product = {
    ...productContent("electrolytes"),
    supplement: info,
    prop65: { chemical: "lead" },
  };

  it("puts the label content and its notices in the Markdown", () => {
    const md = productMarkdown(product, null, "https://shop.test");
    expect(md).toContain("## Supplement Facts");
    expect(md).toContain("| Sodium (as sodium citrate) | 500 mg | 22% |");
    expect(md).toContain("| Hydration blend | 350 mg | † |");
    expect(md).toContain("| Hydration blend: Taurine | 250 mg | † |");
    expect(md).toContain("Contains: Milk.");
    expect(md).toContain("This statement has not been evaluated");
    expect(md).toContain("including lead");
  });

  it("explains the dagger on a blend's total too", () => {
    const md = productMarkdown(
      {
        ...product,
        supplement: {
          ...info,
          facts: info.facts.map((row) => ({ ...row, dailyValue: 5 })),
        },
      },
      null,
      "https://shop.test",
    );
    expect(md).toContain("| Hydration blend | 350 mg | † |");
    expect(md).toContain("† Daily Value not established.");
  });

  it("keeps a product with claims to label facts in JSON-LD, no description", () => {
    const ld = productJsonLd(product, "https://shop.test/p", null) as Record<
      string,
      unknown
    >;
    expect(ld).not.toHaveProperty("description");
    expect(ld.additionalProperty).toEqual([
      {
        "@type": "PropertyValue",
        name: "Serving size",
        value: "1 scoop (6 g)",
      },
      { "@type": "PropertyValue", name: "Servings per container", value: 30 },
    ]);
    const without = productJsonLd(
      { ...product, supplement: { ...info, structureFunctionClaims: 0 } },
      "https://shop.test/p",
      null,
    );
    expect(without).toHaveProperty("description");
  });
});
