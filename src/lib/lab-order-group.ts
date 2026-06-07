/** Shared grouping for lab order lines: category → panel / standalone segments. */

export type LabPanelSegment<T> = { panelLabel: string | null; rows: T[] };

export function groupLabOrderRowsByCategoryAndPanel<T extends { categoryName: string; panelLabel: string | null; lineNo: number }>(
  items: T[]
): Array<{ categoryName: string; segments: LabPanelSegment<T>[] }> {
  const byCat = new Map<string, T[]>();
  for (const it of items) {
    const k = it.categoryName || "Uncategorized";
    const arr = byCat.get(k) ?? [];
    arr.push(it);
    byCat.set(k, arr);
  }
  const catNames = [...byCat.keys()].sort((a, b) => a.localeCompare(b));
  return catNames.map((categoryName) => {
    const list = (byCat.get(categoryName) ?? []).slice();
    list.sort((a, b) => {
      const pa = a.panelLabel ?? "\u0000";
      const pb = b.panelLabel ?? "\u0000";
      if (pa !== pb) return pa.localeCompare(pb);
      return a.lineNo - b.lineNo;
    });
    const segments: LabPanelSegment<T>[] = [];
    for (const row of list) {
      const last = segments[segments.length - 1];
      if (last && last.panelLabel === row.panelLabel) {
        last.rows.push(row);
      } else {
        segments.push({ panelLabel: row.panelLabel, rows: [row] });
      }
    }
    return { categoryName, segments };
  });
}
