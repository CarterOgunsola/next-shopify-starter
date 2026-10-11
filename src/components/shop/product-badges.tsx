import type { Badge } from "@/lib/commerce";

// Product badges as text (never color alone), in a labeled list.
export function ProductBadges({ badges }: { badges?: Badge[] }) {
  if (!badges?.length) return null;
  return (
    <ul aria-label="Product badges">
      {badges.map((badge) => (
        <li key={`${badge.kind}:${badge.label}`} data-badge={badge.kind}>
          {badge.label}
        </li>
      ))}
    </ul>
  );
}
