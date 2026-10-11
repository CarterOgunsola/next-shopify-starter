import type { SupplementInfo } from "./types";

type FactRow = SupplementInfo["facts"][number];

// Rows in label order, a proprietary blend's together under its name and
// total (from whichever of its rows gives it).
export function factGroups(
  facts: FactRow[],
): { blend: string | null; total: string | null; rows: FactRow[] }[] {
  const groups: {
    blend: string | null;
    total: string | null;
    rows: FactRow[];
  }[] = [];
  for (const row of facts) {
    const last = groups.at(-1);
    if (last && last.blend === row.blend) {
      last.rows.push(row);
      last.total ??= row.blendTotal;
    } else {
      groups.push({ blend: row.blend, total: row.blendTotal, rows: [row] });
    }
  }
  return groups;
}
