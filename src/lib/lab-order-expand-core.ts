import { roundMoney } from "@/lib/lab-fee-settlement";

export type LabOrderLineInput = {
  labTestId: number;
  unitPrice: number;
  panelParentTestId: number | null;
};

export type LabTestExpandRow = {
  id: number;
  parentTestId: number | null;
  /** Only top-level / panel tests carry a patient fee; sub-tests are priced only via the panel total. */
  price: number;
  subtests: Array<{ id: number }>;
};

function splitMoneyEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const t = roundMoney(total);
  const slice = roundMoney(t / count);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < count - 1; i++) {
    out.push(slice);
    acc = roundMoney(acc + slice);
  }
  out.push(roundMoney(t - acc));
  return out;
}

/**
 * Expands selected test IDs into order lines: panel/root tests with active sub-tests become one line per sub-test.
 * Panel fee is split across sub-lines; sub-test catalog prices are ignored.
 * Preserves duplicate handling when both parent and child are selected (parent wins).
 */
export function expandLabTestSelectionToOrderLines(
  orderedUniqueTestIds: number[],
  tests: LabTestExpandRow[]
): LabOrderLineInput[] {
  const byId = new Map(tests.map((t) => [t.id, t]));
  const idSet = new Set(orderedUniqueTestIds);
  const lines: LabOrderLineInput[] = [];
  const coveredChildIds = new Set<number>();

  for (const id of orderedUniqueTestIds) {
    const t = byId.get(id);
    if (!t) continue;
    if (t.parentTestId != null && idSet.has(t.parentTestId)) continue;
    if (coveredChildIds.has(id)) continue;

    if (t.subtests.length > 0) {
      const shares = splitMoneyEvenly(t.price, t.subtests.length);
      for (let i = 0; i < t.subtests.length; i++) {
        lines.push({
          labTestId: t.subtests[i].id,
          unitPrice: shares[i] ?? 0,
          panelParentTestId: t.id,
        });
        coveredChildIds.add(t.subtests[i].id);
      }
    } else {
      lines.push({
        labTestId: t.id,
        unitPrice: roundMoney(t.price),
        panelParentTestId: t.parentTestId,
      });
    }
  }
  return lines;
}
