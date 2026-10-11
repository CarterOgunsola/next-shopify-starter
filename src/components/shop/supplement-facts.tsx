import { factGroups } from "@/lib/commerce/supplement-facts";
import type { SupplementInfo } from "@/lib/commerce";
import {
  type ComplianceText,
  DAILY_VALUE_NOT_ESTABLISHED,
  dsheaDisclaimer,
  PLACEHOLDER_MARKER,
  prop65Warning,
} from "@/lib/commerce/compliance";
import { ShopifyImage } from "./shopify-image";

// A regulatory notice, marked as a placeholder until its wording is
// approved (compliance.ts).
export function ComplianceNotice({
  notice,
  label,
}: {
  notice: ComplianceText;
  label?: string;
}) {
  const text = (
    <p>
      {!notice.approved && <strong>[{PLACEHOLDER_MARKER}] </strong>}
      {notice.text}
    </p>
  );
  // A label names the notice as its own region (a <p> can't carry one).
  return label ? <section aria-label={label}>{text}</section> : text;
}

// California Prop 65: shown before anything that adds the product (the
// product page's purchase panel, the quick add dialog).
export function Prop65Notice({
  prop65,
}: {
  prop65: { chemical: string | null } | null | undefined;
}) {
  if (!prop65) return null;
  return (
    <ComplianceNotice
      notice={prop65Warning(prop65.chemical)}
      label="California Proposition 65 warning"
    />
  );
}

// The DSHEA disclaimer for the description's claims (see dsheaDisclaimer),
// marked * like the description it goes with.
export const DSHEA_ID = "dshea-disclaimer";

export function DsheaDisclaimer({ claims }: { claims: number | null }) {
  const notice = dsheaDisclaimer(claims);
  if (!notice) return null;
  return (
    <p id={DSHEA_ID}>
      <span aria-hidden="true">* </span>
      {!notice.approved && <strong>[{PLACEHOLDER_MARKER}] </strong>}
      {notice.text}
    </p>
  );
}

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}|\r?\n/)
    .filter((part) => part.trim())
    .map((part, index) => <p key={index}>{part}</p>);

// The Supplement Facts panel as an HTML table (the label image, if any, is
// a secondary copy), then ingredients, allergens, directions and warnings.
// The Prop 65 warning is shown before the purchase controls (Prop65Notice).
export function SupplementFacts({ info }: { info: SupplementInfo }) {
  const groups = factGroups(info.facts);
  const noDailyValue =
    info.facts.some((row) => row.dailyValue === null) ||
    groups.some((group) => group.total);

  return (
    <section aria-labelledby="supplement-facts">
      <h2 id="supplement-facts">Supplement Facts</h2>
      {info.servingSize && <p>Serving size: {info.servingSize}</p>}
      {info.servingsPerContainer && (
        <p>Servings per container: {info.servingsPerContainer}</p>
      )}
      {info.facts.length > 0 && (
        <table>
          <caption>
            Supplement Facts
            {info.servingSize ? `, per serving (${info.servingSize})` : ""}
          </caption>
          <thead>
            <tr>
              <th scope="col">Ingredient</th>
              <th scope="col">Amount per serving</th>
              <th scope="col">% Daily Value</th>
            </tr>
          </thead>
          {groups.map((group, index) => (
            <tbody key={index}>
              {group.blend && (
                // The blend's name with its total amount; its ingredients'
                // own amounts may be left out.
                <tr>
                  <th scope="rowgroup">{group.blend}</th>
                  <td>{group.total}</td>
                  <td>
                    {group.total && (
                      <>
                        †
                        <span className="sr-only">
                          {" "}
                          {DAILY_VALUE_NOT_ESTABLISHED}
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {group.rows.map((row) => (
                <tr key={`${row.blend ?? ""}-${row.ingredient}`}>
                  <th scope="row">
                    {row.ingredient}
                    {row.source ? ` (as ${row.source})` : ""}
                  </th>
                  <td>
                    {row.amount}
                    {row.unit ? ` ${row.unit}` : ""}
                  </td>
                  <td>
                    {row.dailyValue === null ? (
                      <>
                        †
                        <span className="sr-only">
                          {" "}
                          {DAILY_VALUE_NOT_ESTABLISHED}
                        </span>
                      </>
                    ) : (
                      `${row.dailyValue}%`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      )}
      {noDailyValue && <p>† {DAILY_VALUE_NOT_ESTABLISHED}</p>}
      {info.labelImage && (
        <ShopifyImage
          src={info.labelImage.url}
          alt={info.labelImage.altText ?? "Supplement Facts label"}
          width={info.labelImage.width ?? 600}
          height={info.labelImage.height ?? 600}
          sizes="(min-width: 768px) 24rem, 100vw"
        />
      )}
      {info.otherIngredients.length > 0 && (
        <>
          <h3>Other ingredients</h3>
          <p>{info.otherIngredients.join(", ")}.</p>
        </>
      )}
      {info.allergens.length > 0 && (
        <p>
          <strong>Contains:</strong> {info.allergens.join(", ")}.
        </p>
      )}
      {info.directions && (
        <>
          <h3>Directions</h3>
          {paragraphs(info.directions)}
        </>
      )}
      {info.warnings && (
        <>
          <h3>Warnings</h3>
          {paragraphs(info.warnings)}
        </>
      )}
    </section>
  );
}
