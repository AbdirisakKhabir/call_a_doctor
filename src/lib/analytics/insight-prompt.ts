import type { AnalyticsReport, AnalyticsValueFormat } from "@/lib/analytics/types";

/** Keeps the prompt small enough to stay cheap while preserving the shape of every chart. */
const MAX_SERIES_POINTS = 40;
const MAX_TABLE_ROWS = 12;

export const ANALYTICS_INSIGHT_SYSTEM_PROMPT = [
  "You are a healthcare clinic business analyst writing the commentary section of a management report.",
  "You are given a fully computed report: headline figures, chart data, and tables. Every number you cite must come from that data — never estimate, extrapolate, or invent figures.",
  "Write in plain British English for a clinic manager who is not a data analyst. Explain what the numbers mean and what to do about them.",
  "Structure the answer with these exact markdown headings, in this order:",
  "## Headline",
  "## What the numbers show",
  "## Risks and anomalies",
  "## Recommended actions",
  "Under 'Headline' write two or three sentences summarising performance for the period. Under the other headings use short bullet points (at most five each).",
  "Reference concrete figures, names, and percentages from the data. If the report is empty or nearly empty, say so plainly instead of speculating.",
  "Do not repeat the raw tables, do not add extra headings, and do not use emojis.",
].join(" ");

function formatValue(value: number, format: AnalyticsValueFormat): string {
  if (!Number.isFinite(value)) return "0";
  if (format === "currency") return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  if (format === "percent") return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  if (format === "days") return `${value} days`;
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function compactPoints(categories: string[], values: number[], format: AnalyticsValueFormat): string {
  const pairs = categories.map((category, i) => `${category}: ${formatValue(values[i] ?? 0, format)}`);
  if (pairs.length <= MAX_SERIES_POINTS) return pairs.join(", ");
  const head = pairs.slice(0, MAX_SERIES_POINTS / 2);
  const tail = pairs.slice(-MAX_SERIES_POINTS / 2);
  return `${head.join(", ")}, … , ${tail.join(", ")}`;
}

/** Turns a report into the compact text block the model reasons over. */
export function summariseReportForPrompt(report: AnalyticsReport): string {
  const lines: string[] = [];

  lines.push(`REPORT: ${report.title}`);
  lines.push(`PERIOD: ${report.range.from} to ${report.range.to}`);
  lines.push(`SCOPE: ${report.branchLabel}`);
  if (report.notes.length > 0) {
    lines.push(`CAVEATS: ${report.notes.join(" ")}`);
  }

  lines.push("", "HEADLINE FIGURES:");
  for (const kpi of report.kpis) {
    const change =
      kpi.changePercent == null
        ? ""
        : ` (${kpi.changePercent >= 0 ? "+" : ""}${kpi.changePercent}% vs the previous period of the same length)`;
    const hint = kpi.hint ? ` — ${kpi.hint}` : "";
    lines.push(`- ${kpi.label}: ${formatValue(kpi.value, kpi.format)}${change}${hint}`);
  }

  lines.push("", "CHART DATA:");
  for (const chart of report.charts) {
    if (chart.categories.length === 0) {
      lines.push(`- ${chart.title}: no data in this period.`);
      continue;
    }
    lines.push(`- ${chart.title}${chart.subtitle ? ` (${chart.subtitle})` : ""}:`);
    for (const series of chart.series) {
      lines.push(`    ${series.name} → ${compactPoints(chart.categories, series.data, chart.format)}`);
    }
  }

  lines.push("", "TABLES:");
  for (const table of report.tables) {
    if (table.rows.length === 0) {
      lines.push(`- ${table.title}: no rows.`);
      continue;
    }
    lines.push(`- ${table.title} (${table.rows.length} row${table.rows.length === 1 ? "" : "s"}, showing up to ${MAX_TABLE_ROWS}):`);
    for (const row of table.rows.slice(0, MAX_TABLE_ROWS)) {
      const cells = table.columns.map((column) => {
        const raw = row[column.key];
        if (raw == null || raw === "") return `${column.label}: —`;
        const rendered = typeof raw === "number" ? formatValue(raw, column.format ?? "number") : String(raw);
        return `${column.label}: ${rendered}`;
      });
      lines.push(`    ${cells.join(" | ")}`);
    }
  }

  return lines.join("\n");
}
