import type { AnalyticsValueFormat } from "@/lib/analytics/types";

/** Chart series colours, reused across every analytics section for a consistent look. */
export const ANALYTICS_PALETTE = [
  "#465fff",
  "#12b76a",
  "#f79009",
  "#f04438",
  "#7a5af8",
  "#06aed4",
  "#ec4899",
  "#84cc16",
  "#0ea5e9",
  "#a855f7",
  "#f43f5e",
  "#64748b",
];

export function formatAnalyticsValue(value: number, format: AnalyticsValueFormat = "number"): string {
  if (!Number.isFinite(value)) return "—";
  if (format === "currency") {
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (format === "percent") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
  }
  if (format === "days") {
    return `${value.toLocaleString("en-US", { maximumFractionDigits: 1 })} d`;
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Shortened axis labels so long currency values do not crowd the chart. */
export function formatAnalyticsAxis(value: number, format: AnalyticsValueFormat = "number"): string {
  if (!Number.isFinite(value)) return "";
  const abs = Math.abs(value);
  const compact =
    abs >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(value / 1_000).toFixed(1)}k`
        : value.toLocaleString("en-US", { maximumFractionDigits: abs < 10 ? 1 : 0 });

  if (format === "currency") return `$${compact}`;
  if (format === "percent") return `${compact}%`;
  return compact;
}

export function formatIsoDateLabel(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
