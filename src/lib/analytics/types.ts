/** Shape of a complete analytics report, built server-side and rendered generically. */

export type AnalyticsValueFormat = "currency" | "number" | "percent" | "days";

export type AnalyticsKpi = {
  key: string;
  label: string;
  value: number;
  format: AnalyticsValueFormat;
  /** Short explanation shown under the number. */
  hint?: string;
  /** Change vs the immediately preceding period of the same length, in percent. */
  changePercent?: number | null;
};

export type AnalyticsChartType = "bar" | "line" | "area" | "donut" | "hbar";

export type AnalyticsChart = {
  key: string;
  title: string;
  subtitle?: string;
  type: AnalyticsChartType;
  /** X axis labels (bar/line/area) or slice labels (donut/hbar). */
  categories: string[];
  series: { name: string; data: number[] }[];
  format: AnalyticsValueFormat;
  /** Column span in a 12-column grid. */
  span: 4 | 6 | 12;
  /** Render as stacked columns (bar only). */
  stacked?: boolean;
};

export type AnalyticsTableColumn = {
  key: string;
  label: string;
  align?: "left" | "right";
  format?: AnalyticsValueFormat;
};

export type AnalyticsTable = {
  key: string;
  title: string;
  subtitle?: string;
  columns: AnalyticsTableColumn[];
  rows: Record<string, string | number | null>[];
  /** Optional totals row keyed by column key. */
  totals?: Record<string, string | number | null>;
};

export type AnalyticsReport = {
  section: string;
  title: string;
  description: string;
  range: { from: string; to: string };
  branchLabel: string;
  /** Caveats shown under the header (e.g. data not scoped by branch). */
  notes: string[];
  kpis: AnalyticsKpi[];
  charts: AnalyticsChart[];
  tables: AnalyticsTable[];
};
