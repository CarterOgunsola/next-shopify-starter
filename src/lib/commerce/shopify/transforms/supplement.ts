import { z } from "zod";
import type { Image, SupplementInfo } from "../../types";
import { toImage } from "./media";

// Supplement content from the product's supplement.* metafields (types in
// docs: the definitions are listed in the commerce README). Each field is
// checked; a field that doesn't parse is left out rather than shown wrong,
// and a product with none of them isn't a supplement (null).

type MetafieldData = {
  key: string;
  value: string;
  reference?: unknown;
} | null;

type ImageData = Parameters<typeof toImage>[0];

// The label image, when the reference is a MediaImage.
function referencedImage(reference: unknown): ImageData | null {
  const image = (reference as { image?: unknown } | null | undefined)?.image;
  return image && typeof (image as { url?: unknown }).url === "string"
    ? (image as ImageData)
    : null;
}

// The nine major food allergens (FDA, sesame since 2023).
export const MAJOR_ALLERGENS = [
  "Milk",
  "Eggs",
  "Fish",
  "Crustacean shellfish",
  "Tree nuts",
  "Peanuts",
  "Wheat",
  "Soybeans",
  "Sesame",
] as const;

const text = z.string().trim().min(1).max(5_000);
const factRow = z.object({
  ingredient: z.string().trim().min(1).max(200),
  amount: z.string().trim().min(1).max(40),
  unit: z.string().trim().max(20).default(""),
  // Percent of Daily Value; null where none is established (shown as †).
  daily_value: z.number().min(0).max(100_000).nullable().default(null),
  source: z.string().trim().max(200).nullable().default(null),
  // Rows of one proprietary blend share its name, and its total amount
  // ("1.2 g", on any of them), which the label shows with the name.
  blend: z.string().trim().max(200).nullable().default(null),
  blend_total: z.string().trim().max(40).nullable().default(null),
});
const facts = z.array(factRow).max(100);
const list = z.array(z.string().trim().min(1).max(200)).max(100);
// The allergens whose label statement names the kind ("Contains: Almonds",
// not "Tree nuts").
const NAMED_KIND = new Set<string>([
  "Tree nuts",
  "Fish",
  "Crustacean shellfish",
]);

// Other ways merchants write the nine (lowercase): read as the label
// names them.
const SYNONYMS: Record<string, (typeof MAJOR_ALLERGENS)[number]> = {
  milk: "Milk",
  egg: "Eggs",
  eggs: "Eggs",
  fish: "Fish",
  shellfish: "Crustacean shellfish",
  "crustacean shellfish": "Crustacean shellfish",
  crustaceans: "Crustacean shellfish",
  "tree nut": "Tree nuts",
  "tree nuts": "Tree nuts",
  peanut: "Peanuts",
  peanuts: "Peanuts",
  wheat: "Wheat",
  soy: "Soybeans",
  soya: "Soybeans",
  soybean: "Soybeans",
  soybeans: "Soybeans",
  sesame: "Sesame",
  "sesame seed": "Sesame",
  "sesame seeds": "Sesame",
};

// One allergen as the label states it, and what's wrong with it if
// anything. "Milk", "Soy" (Soybeans), or "Tree nuts (almonds)" with the
// kind ("Almonds"): only the first parenthesis names the kind ("Fish (cod)
// (smoked)" is Cod). A value that isn't one of the nine is shown as
// written, never dropped: an allergen statement must not lose one.
export function readAllergen(value: string): {
  label: string;
  problem: string | null;
} {
  const raw = value.trim();
  const [, base, kind, rest] =
    /^([^(]*?)\s*(?:\(([^)]*)\)(.*))?$/.exec(raw) ?? [];
  const major = SYNONYMS[(base ?? "").toLowerCase().replace(/\s+/g, " ")];
  if (!major) {
    return {
      label: raw,
      problem: `not one of the nine major allergens: ${raw}`,
    };
  }
  const named = kind?.trim();
  const label =
    named && NAMED_KIND.has(major)
      ? named[0].toUpperCase() + named.slice(1)
      : major;
  if (rest?.trim()) {
    return { label, problem: `text after the kind ignored: ${raw}` };
  }
  if (!named && NAMED_KIND.has(major)) {
    // The label has to name the kind (almonds, cod, shrimp).
    return { label, problem: `kind missing: ${raw}` };
  }
  return { label, problem: null };
}

// The allergens metafield's values as the label states them, logging any
// problem (launch:check fails on them). A value that isn't a list is
// shown as it is rather than read as none.
export function readAllergens(raw: string | undefined): {
  labels: string[];
  problems: string[];
} {
  if (raw === undefined) return { labels: [], problems: [] };
  const values = parse(list, raw);
  if (!values) {
    return {
      labels: [raw.trim()].filter(Boolean),
      problems: [`allergens isn't a list of names: ${raw}`],
    };
  }
  const read = values.map(readAllergen);
  return {
    labels: [...new Set(read.map((a) => a.label))],
    problems: read.flatMap((a) => (a.problem ? [a.problem] : [])),
  };
}

function parse<T>(schema: z.ZodType<T>, raw: string | undefined, json = true) {
  if (raw === undefined) return undefined;
  try {
    const result = schema.safeParse(json ? JSON.parse(raw) : raw);
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

const count = (raw: string | undefined) => {
  const value = Number.parseInt(raw ?? "", 10);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

// California Prop 65: the product carries the warning (supplement.
// prop65_warning "true"), naming the chemical when known. Shared by the
// product page and listing cards, so every way to add the product knows.
export function toProp65(
  metafields: readonly MetafieldData[],
): { chemical: string | null } | null {
  const byKey = new Map(
    metafields.flatMap((field) => (field ? [[field.key, field.value]] : [])),
  );
  return byKey.get("prop65_warning") === "true"
    ? { chemical: parse(text, byKey.get("prop65_chemical"), false) ?? null }
    : null;
}

// How many structure/function claims the page makes; null when the count
// is missing or isn't a whole number (the disclaimer then shows, and it's
// flagged outside production).
function claimCount(raw: string | undefined): number | null {
  const value = Number(raw);
  if (
    raw !== undefined &&
    raw.trim() !== "" &&
    Number.isInteger(value) &&
    value >= 0
  ) {
    return value;
  }
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      "[supplement] no valid structure_function_claims count: showing the DSHEA disclaimer.",
    );
  }
  return null;
}

export function toSupplementInfo(
  metafields: readonly MetafieldData[],
): SupplementInfo | null {
  const byKey = new Map(
    metafields.flatMap((field) => (field ? [[field.key, field]] : [])),
  );
  // A supplement has label facts or a claim count. Other supplement.*
  // fields alone (a Prop 65 flag, say) don't make one: no Supplement Facts
  // or DSHEA disclaimer for them.
  if (!byKey.has("facts") && !byKey.has("structure_function_claims")) {
    return null;
  }
  const raw = (key: string) => byKey.get(key)?.value;
  const image = referencedImage(byKey.get("label_image")?.reference);
  const labelImage: Image | null = image ? toImage(image) : null;
  const servings = count(raw("servings_per_container"));
  const allergens = readAllergens(raw("allergens"));
  for (const problem of allergens.problems) {
    console.warn(`[supplement] allergen ${problem}`);
  }
  return {
    servingSize: parse(text, raw("serving_size"), false) ?? null,
    servingsPerContainer: servings || null,
    facts:
      parse(facts, raw("facts"))?.map((row) => ({
        ingredient: row.ingredient,
        amount: row.amount,
        unit: row.unit,
        dailyValue: row.daily_value,
        source: row.source,
        blend: row.blend,
        blendTotal: row.blend_total,
      })) ?? [],
    otherIngredients: parse(list, raw("other_ingredients")) ?? [],
    allergens: allergens.labels,
    directions: parse(text, raw("directions"), false) ?? null,
    warnings: parse(text, raw("warnings"), false) ?? null,
    structureFunctionClaims: claimCount(raw("structure_function_claims")),
    labelImage,
  };
}
