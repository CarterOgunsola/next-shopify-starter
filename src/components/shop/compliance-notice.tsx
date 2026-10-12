import {
  type ComplianceText,
  PLACEHOLDER_MARKER,
} from "@/lib/commerce/compliance";

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
