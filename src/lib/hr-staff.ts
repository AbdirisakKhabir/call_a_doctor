/** Weekday codes stored as JSON in `StaffMember.workingDays`. */
export const WORKDAY_OPTIONS = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
] as const;

export type WorkdayCode = (typeof WORKDAY_OPTIONS)[number]["value"];

const ALLOWED = new Set(WORKDAY_OPTIONS.map((d) => d.value));

export function normalizeWorkingDays(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const x of input) {
    const v = typeof x === "string" ? x.trim().toLowerCase() : "";
    if (ALLOWED.has(v as WorkdayCode) && !out.includes(v)) out.push(v);
  }
  return out;
}

export function formatWorkingDaysLabel(json: string): string {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return "—";
    const labels = WORKDAY_OPTIONS.filter((o) => arr.includes(o.value)).map((o) => o.label);
    return labels.length ? labels.join(", ") : "—";
  } catch {
    return "—";
  }
}

const DAY_ORDER = WORKDAY_OPTIONS.map((o) => o.value);
const DAY_LABEL: Record<string, string> = Object.fromEntries(WORKDAY_OPTIONS.map((o) => [o.value, o.label]));

/**
 * Plain-language days for reports and notices (e.g. "Monday through Friday" or "Monday; Wednesday; Friday").
 */
export function formatWorkingDaysPlainEnglish(json: string): string {
  try {
    const arr = JSON.parse(json) as unknown;
    if (!Array.isArray(arr)) return "—";
    const set = new Set(arr.filter((x): x is string => typeof x === "string"));
    if (!DAY_ORDER.some((d) => set.has(d))) return "—";

    const runs: string[][] = [];
    let cur: string[] = [];
    for (const d of DAY_ORDER) {
      if (set.has(d)) cur.push(d);
      else {
        if (cur.length) runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);

    const fmtRun = (run: string[]): string => {
      if (run.length === 1) return DAY_LABEL[run[0]] ?? run[0];
      if (run.length === 2)
        return `${DAY_LABEL[run[0]] ?? run[0]} and ${DAY_LABEL[run[1]] ?? run[1]}`;
      const a = DAY_LABEL[run[0]] ?? run[0];
      const b = DAY_LABEL[run[run.length - 1]] ?? run[run.length - 1];
      return `${a} through ${b}`;
    };
    return runs.map(fmtRun).join("; ");
  } catch {
    return "—";
  }
}
