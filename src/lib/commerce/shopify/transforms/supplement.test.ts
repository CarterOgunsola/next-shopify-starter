import { describe, expect, it, vi } from "vitest";
import { readAllergens, toSupplementInfo } from "./supplement";

// Synthetic metafields in the Storefront API's shape.
const field = (key: string, value: unknown, reference: unknown = null) => ({
  key,
  value: typeof value === "string" ? value : JSON.stringify(value),
  reference,
});

const full = [
  field("serving_size", "1 scoop (6 g)"),
  field("servings_per_container", "30"),
  field("facts", [
    {
      ingredient: "Sodium",
      amount: "500",
      unit: "mg",
      daily_value: 22,
      source: "sodium citrate",
    },
    { ingredient: "Potassium", amount: "200", unit: "mg", daily_value: 4 },
    {
      ingredient: "Taurine",
      amount: "250",
      unit: "mg",
      daily_value: null,
      blend: "Hydration blend",
      blend_total: "400 mg",
    },
  ]),
  field("other_ingredients", ["Citric acid", "Natural flavor"]),
  field("allergens", [
    "milk",
    "Soybeans",
    "Celery",
    "Tree nuts (almonds)",
    "Fish (cod)",
    "Milk (whey)",
  ]),
  field("directions", "Mix one scoop with 16 oz of water."),
  field("warnings", "Keep out of reach of children."),
  field("structure_function_claims", "2"),
  field("prop65_warning", "true"),
  field("prop65_chemical", "lead"),
  field("label_image", "gid://shopify/MediaImage/1", {
    image: {
      url: "https://cdn.shopify.com/label.png",
      altText: null,
      width: 800,
      height: 1200,
    },
  }),
];

describe("toSupplementInfo", () => {
  it("reads every supplement field", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(toSupplementInfo(full)).toEqual({
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
          ingredient: "Potassium",
          amount: "200",
          unit: "mg",
          dailyValue: 4,
          source: null,
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
          blendTotal: "400 mg",
        },
      ],
      otherIngredients: ["Citric acid", "Natural flavor"],
      // As the label states them: the kind for tree nuts and fish, the name
      // otherwise (whey is Milk). Celery isn't one of the nine: shown as
      // written, never dropped.
      allergens: ["Milk", "Soybeans", "Celery", "Almonds", "Cod"],
      directions: "Mix one scoop with 16 oz of water.",
      warnings: "Keep out of reach of children.",
      structureFunctionClaims: 2,
      labelImage: {
        url: "https://cdn.shopify.com/label.png",
        altText: null,
        width: 800,
        height: 1200,
      },
    });
    // What isn't an allergen is logged, not dropped unnoticed.
    expect(warn).toHaveBeenCalledWith(
      "[supplement] allergen not one of the nine major allergens: Celery",
    );
    warn.mockRestore();
  });

  it("is null for a product without supplement content (unset metafields)", () => {
    expect(toSupplementInfo([null, null, null])).toBeNull();
  });

  it("leaves out a field that doesn't parse rather than showing it wrong", () => {
    const info = toSupplementInfo([
      field("serving_size", "1 capsule"),
      field("facts", "{not json"),
      field("servings_per_container", "-3"),
      field("other_ingredients", { not: "a list" }),
      field("structure_function_claims", "lots"),
      field("prop65_warning", "false"),
    ]);
    expect(info).toMatchObject({
      servingSize: "1 capsule",
      servingsPerContainer: null,
      facts: [],
      otherIngredients: [],
      // Not a count: unknown, so the disclaimer shows.
      structureFunctionClaims: null,
    });
  });

  it("reads only the first parenthesis as an allergen's kind, and flags what's missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const allergens = (values: string[]) =>
      toSupplementInfo([
        field("structure_function_claims", "0"),
        field("allergens", values),
      ])?.allergens;
    expect(allergens(["Fish (cod) (smoked)", "Tree nuts"])).toEqual([
      "Cod",
      "Tree nuts",
    ]);
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      "[supplement] allergen text after the kind ignored: Fish (cod) (smoked)",
      "[supplement] allergen kind missing: Tree nuts",
    ]);
    warn.mockRestore();
  });

  it("reads the usual ways of writing the nine allergens", () => {
    expect(
      readAllergens(
        JSON.stringify([
          "Soy",
          "soya",
          "Egg",
          "Peanut",
          "Shellfish (shrimp)",
          "sesame seeds",
          "Wheat",
          "milk",
        ]),
      ),
    ).toEqual({
      labels: [
        "Soybeans",
        "Eggs",
        "Peanuts",
        "Shrimp",
        "Sesame",
        "Wheat",
        "Milk",
      ],
      problems: [],
    });
  });

  it("never drops an allergen it can't read", () => {
    expect(readAllergens(JSON.stringify(["Gluten", "Peanuts"]))).toEqual({
      labels: ["Gluten", "Peanuts"],
      problems: ["not one of the nine major allergens: Gluten"],
    });
    // Not a list: shown as it is, not read as none.
    expect(readAllergens("Milk, soy")).toEqual({
      labels: ["Milk, soy"],
      problems: ["allergens isn't a list of names: Milk, soy"],
    });
    expect(readAllergens(undefined)).toEqual({ labels: [], problems: [] });
  });

  it("isn't a supplement without label facts or a claim count", () => {
    // A Prop 65 flag alone (any product can carry one) isn't a supplement:
    // no Supplement Facts or DSHEA disclaimer.
    expect(
      toSupplementInfo([
        field("prop65_warning", "true"),
        field("prop65_chemical", "lead"),
        field("serving_size", "1 capsule"),
      ]),
    ).toBeNull();
  });

  it("knows a page with no claims only from an explicit 0, and flags a missing count", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      toSupplementInfo([field("structure_function_claims", "0")])
        ?.structureFunctionClaims,
    ).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    const facts = field("facts", [
      { ingredient: "Sodium", amount: "500", unit: "mg", daily_value: 22 },
    ]);
    expect(toSupplementInfo([facts])?.structureFunctionClaims).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("supplement content recorded from the dev store", () => {
  it("reads the seeded electrolytes and creatine products", async () => {
    const { toProductContent } = await import("./product");
    const electrolytes = (
      await import("../../testing/fixtures/ProductContent.test-electrolytes.json")
    ).default;
    const creatine = (
      await import("../../testing/fixtures/ProductContent.test-subscription-only.json")
    ).default;
    type Data = Parameters<typeof toProductContent>[0];
    const e = toProductContent(
      electrolytes.data.product as unknown as Data,
    ).supplement;
    expect(e?.servingSize).toBe("1 stick pack (6 g)");
    expect(e?.facts.map((row) => row.ingredient)).toEqual([
      "Sodium",
      "Potassium",
      "Magnesium",
      "Taurine",
      "Coconut water powder",
    ]);
    expect(e?.structureFunctionClaims).toBe(1);

    const content = toProductContent(creatine.data.product as unknown as Data);
    const c = content.supplement;
    // On the product, not its supplement content.
    expect(content.prop65).toEqual({ chemical: "lead" });
    expect(c?.allergens).toEqual(["Soybeans"]);
    // Unset (Shopify drops an empty list): no other ingredients.
    expect(c?.otherIngredients).toEqual([]);
    expect(c?.structureFunctionClaims).toBe(0);
  });
});
