import { prisma } from "@/lib/prisma";
import { getUserBranchIdFilter } from "@/lib/visit-card-access";

/**
 * Date handling note: `@db.Date` columns (appointmentDate, expenseDate, visitDate) come back as
 * UTC midnight, while true timestamps (saleDate, createdAt) are local wall-clock moments. Each
 * needs its own range filter and its own day-key formatter, otherwise rows land in the wrong bucket.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Above this many days a daily axis is unreadable, so buckets switch to months. */
const MONTH_BUCKET_THRESHOLD_DAYS = 92;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function parseIsoDate(iso: string | null): { y: number; m: number; d: number } | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** Day key for a `@db.Date` column. */
export function dateOnlyKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Day key for a timestamp column, in the server's local zone. */
export function timestampKey(value: Date): string {
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export type AnalyticsScope = {
  from: string;
  to: string;
  /** Range for `@db.Date` columns. */
  dateOnlyFilter: { gte: Date; lte: Date };
  /** Range for timestamp columns. */
  timestampFilter: { gte: Date; lte: Date };
  /** Same length as the selected range, immediately before it — powers period-over-period deltas. */
  previous: {
    from: string;
    to: string;
    dateOnlyFilter: { gte: Date; lte: Date };
    timestampFilter: { gte: Date; lte: Date };
  };
  branchId: number | null;
  /** Branches the user may see; null = unrestricted. */
  allowedBranchIds: number[] | null;
  /** Spread into a Prisma `where` on models that have `branchId`. */
  branchWhere: { branchId?: number | { in: number[] } };
  branchLabel: string;
  dayCount: number;
};

export type AnalyticsScopeResult =
  | { ok: true; scope: AnalyticsScope }
  | { ok: false; error: string; status: number };

function rangeFilters(fromParts: { y: number; m: number; d: number }, toParts: { y: number; m: number; d: number }) {
  return {
    dateOnlyFilter: {
      gte: new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d, 0, 0, 0, 0)),
      lte: new Date(Date.UTC(toParts.y, toParts.m - 1, toParts.d, 23, 59, 59, 999)),
    },
    timestampFilter: {
      gte: new Date(fromParts.y, fromParts.m - 1, fromParts.d, 0, 0, 0, 0),
      lte: new Date(toParts.y, toParts.m - 1, toParts.d, 23, 59, 59, 999),
    },
  };
}

/** Validates the date range, resolves the branch filter, and checks the user may see that branch. */
export async function resolveAnalyticsScope(
  searchParams: URLSearchParams,
  userId: number
): Promise<AnalyticsScopeResult> {
  const fromParts = parseIsoDate(searchParams.get("from"));
  const toParts = parseIsoDate(searchParams.get("to"));
  if (!fromParts || !toParts) {
    return { ok: false, error: "Query parameters from and to (YYYY-MM-DD) are required.", status: 400 };
  }

  const fromIso = `${fromParts.y}-${pad(fromParts.m)}-${pad(fromParts.d)}`;
  const toIso = `${toParts.y}-${pad(toParts.m)}-${pad(toParts.d)}`;
  if (fromIso > toIso) {
    return { ok: false, error: "The start date must be on or before the end date.", status: 400 };
  }

  const current = rangeFilters(fromParts, toParts);
  const dayCount =
    Math.round(
      (Date.UTC(toParts.y, toParts.m - 1, toParts.d) - Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d)) / DAY_MS
    ) + 1;

  const prevEnd = new Date(Date.UTC(fromParts.y, fromParts.m - 1, fromParts.d) - DAY_MS);
  const prevStart = new Date(prevEnd.getTime() - (dayCount - 1) * DAY_MS);
  const prevStartParts = {
    y: prevStart.getUTCFullYear(),
    m: prevStart.getUTCMonth() + 1,
    d: prevStart.getUTCDate(),
  };
  const prevEndParts = { y: prevEnd.getUTCFullYear(), m: prevEnd.getUTCMonth() + 1, d: prevEnd.getUTCDate() };
  const previousFilters = rangeFilters(prevStartParts, prevEndParts);

  const allowedBranchIds = await getUserBranchIdFilter(userId);
  const branchIdParam = searchParams.get("branchId");
  let branchId: number | null = null;

  if (branchIdParam) {
    const parsed = Number(branchIdParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, error: "Invalid branch", status: 400 };
    }
    if (allowedBranchIds && !allowedBranchIds.includes(parsed)) {
      return { ok: false, error: "Branch not allowed", status: 403 };
    }
    branchId = parsed;
  } else if (allowedBranchIds && allowedBranchIds.length === 1) {
    branchId = allowedBranchIds[0]!;
  }

  const branchWhere: AnalyticsScope["branchWhere"] =
    branchId != null
      ? { branchId }
      : allowedBranchIds && allowedBranchIds.length > 0
        ? { branchId: { in: allowedBranchIds } }
        : {};

  let branchLabel: string;
  if (branchId != null) {
    const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } });
    branchLabel = branch?.name ?? `Branch #${branchId}`;
  } else {
    branchLabel = allowedBranchIds && allowedBranchIds.length > 0 ? "All my branches" : "All branches";
  }

  return {
    ok: true,
    scope: {
      from: fromIso,
      to: toIso,
      dateOnlyFilter: current.dateOnlyFilter,
      timestampFilter: current.timestampFilter,
      previous: {
        from: `${prevStartParts.y}-${pad(prevStartParts.m)}-${pad(prevStartParts.d)}`,
        to: `${prevEndParts.y}-${pad(prevEndParts.m)}-${pad(prevEndParts.d)}`,
        dateOnlyFilter: previousFilters.dateOnlyFilter,
        timestampFilter: previousFilters.timestampFilter,
      },
      branchId,
      allowedBranchIds,
      branchWhere,
      branchLabel,
      dayCount,
    },
  };
}

export type TimeBuckets = {
  /** Bucket keys in chronological order. */
  keys: string[];
  /** Human labels aligned with `keys`. */
  labels: string[];
  /** Bucket key for a day key (YYYY-MM-DD). */
  bucketOf: (dayKey: string) => string;
  granularity: "day" | "month";
};

/** Continuous day or month buckets so charts show gaps instead of collapsing empty periods. */
export function buildTimeBuckets(scope: AnalyticsScope): TimeBuckets {
  const granularity: "day" | "month" = scope.dayCount > MONTH_BUCKET_THRESHOLD_DAYS ? "month" : "day";
  const start = parseIsoDate(scope.from)!;
  const end = parseIsoDate(scope.to)!;
  const keys: string[] = [];
  const labels: string[] = [];

  if (granularity === "day") {
    let cursor = Date.UTC(start.y, start.m - 1, start.d);
    const last = Date.UTC(end.y, end.m - 1, end.d);
    while (cursor <= last) {
      const d = new Date(cursor);
      const key = d.toISOString().slice(0, 10);
      keys.push(key);
      labels.push(`${pad(d.getUTCDate())} ${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}`);
      cursor += DAY_MS;
    }
    return { keys, labels, bucketOf: (dayKey) => dayKey, granularity };
  }

  let year = start.y;
  let month = start.m;
  while (year < end.y || (year === end.y && month <= end.m)) {
    const key = `${year}-${pad(month)}`;
    keys.push(key);
    labels.push(
      new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      })
    );
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return { keys, labels, bucketOf: (dayKey) => dayKey.slice(0, 7), granularity };
}

/** Sums values into the bucket layout, returning one number per bucket key. */
export function seriesFromBuckets(buckets: TimeBuckets, entries: { dayKey: string; value: number }[]): number[] {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = buckets.bucketOf(entry.dayKey);
    totals.set(key, (totals.get(key) ?? 0) + entry.value);
  }
  return buckets.keys.map((key) => round2(totals.get(key) ?? 0));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Percent change vs the previous period; null when there is no baseline to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return round2(((current - previous) / Math.abs(previous)) * 100);
}

export function safeDivide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

/** Descending sort with a cap, so "top N" tables and bars stay readable. */
export function topN<T>(rows: T[], count: number, weight: (row: T) => number): T[] {
  return [...rows].sort((a, b) => weight(b) - weight(a)).slice(0, count);
}
