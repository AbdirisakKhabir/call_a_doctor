import { ANALYTICS_BUILDERS } from "../src/lib/analytics/registry";
import type { AnalyticsScope } from "../src/lib/analytics/scope";
import { summariseReportForPrompt } from "../src/lib/analytics/insight-prompt";

function scopeFor(from: string, to: string): AnalyticsScope {
  const [fy, fm, fd] = from.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = to.split("-").map(Number) as [number, number, number];
  return {
    from,
    to,
    dateOnlyFilter: {
      gte: new Date(Date.UTC(fy, fm - 1, fd)),
      lte: new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999)),
    },
    timestampFilter: {
      gte: new Date(fy, fm - 1, fd),
      lte: new Date(ty, tm - 1, td, 23, 59, 59, 999),
    },
    previous: {
      from,
      to,
      dateOnlyFilter: {
        gte: new Date(Date.UTC(fy - 1, fm - 1, fd)),
        lte: new Date(Date.UTC(ty - 1, tm - 1, td, 23, 59, 59, 999)),
      },
      timestampFilter: {
        gte: new Date(fy - 1, fm - 1, fd),
        lte: new Date(ty - 1, tm - 1, td, 23, 59, 59, 999),
      },
    },
    branchId: null,
    allowedBranchIds: null,
    branchWhere: {},
    branchLabel: "All branches",
    dayCount: 365,
  };
}

async function main() {
  const scope = scopeFor("2025-01-01", "2026-12-31");
  for (const [key, build] of Object.entries(ANALYTICS_BUILDERS)) {
    const started = Date.now();
    const report = await build(scope);
    const promptChars = summariseReportForPrompt(report).length;
    console.log(
      `${key.padEnd(14)} ok in ${String(Date.now() - started).padStart(5)}ms · ` +
        `${report.kpis.length} KPIs · ${report.charts.length} charts · ${report.tables.length} tables · ` +
        `${report.tables.reduce((n, t) => n + t.rows.length, 0)} rows · prompt ${promptChars} chars`
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
