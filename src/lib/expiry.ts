export type ExpirySoonMode = "days" | "months";

/** How “expiring soon” is calculated (orange badge + inventory filter). */
export type ExpirySoonConfig = {
  mode: ExpirySoonMode;
  /** When mode is days: max days from today (inclusive) still counted as soon. */
  days: number;
  /** When mode is months: through end of calendar month N (1 = this month, 2 = next month, …). */
  months: number;
};

export const DEFAULT_EXPIRY_SOON_CONFIG: ExpirySoonConfig = {
  mode: "days",
  days: 10,
  months: 1,
};

/** @deprecated use DEFAULT_EXPIRY_SOON_CONFIG.days */
export const EXPIRY_SOON_DAYS = DEFAULT_EXPIRY_SOON_CONFIG.days;

export type ExpiryTone = "expired" | "soon" | "ok" | "none";

/** Last calendar day of month offset: 1 = end of current month, 2 = end of next month. */
function endOfMonthAfterMonths(today: Date, monthsCount: number): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  return new Date(y, m + monthsCount, 0);
}

/**
 * Compares calendar dates in local time.
 * Red: past expiry; orange: within configured “soon” window; green: later.
 */
export function getExpiryTone(
  expiryDate: string | null | undefined,
  config: ExpirySoonConfig = DEFAULT_EXPIRY_SOON_CONFIG
): ExpiryTone {
  if (!expiryDate) return "none";
  const ymd = expiryDate.length >= 10 ? expiryDate.slice(0, 10) : expiryDate;
  const exp = new Date(ymd + "T12:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  exp.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (exp.getTime() - today.getTime()) / 86400000
  );
  if (diffDays < 0) return "expired";

  let isSoon = false;
  if (config.mode === "days") {
    isSoon = diffDays <= config.days;
  } else {
    const boundary = endOfMonthAfterMonths(today, config.months);
    boundary.setHours(0, 0, 0, 0);
    isSoon = exp.getTime() <= boundary.getTime();
  }

  if (isSoon) return "soon";
  return "ok";
}

export type InventoryExpiryFilter = "all" | "expired" | "soon" | "not_expired";

/** Client-side inventory filter: expired / soon / not expired (ok or no date). */
export function matchesInventoryExpiryFilter(
  expiryDate: string | null | undefined,
  filter: InventoryExpiryFilter,
  config: ExpirySoonConfig = DEFAULT_EXPIRY_SOON_CONFIG
): boolean {
  if (filter === "all") return true;
  const tone = getExpiryTone(expiryDate, config);
  if (filter === "expired") return tone === "expired";
  if (filter === "soon") return tone === "soon";
  if (filter === "not_expired") return tone === "ok" || tone === "none";
  return true;
}

/** Short label for the “Expiring soon” inventory filter option. */
export function expirySoonFilterOptionLabel(config: ExpirySoonConfig): string {
  if (config.mode === "days") {
    return `Expiring soon (≤${config.days} day${config.days === 1 ? "" : "s"})`;
  }
  if (config.months === 1) {
    return "Expiring soon (through end of this month)";
  }
  if (config.months === 2) {
    return "Expiring soon (through end of next month)";
  }
  return `Expiring soon (through end of month +${config.months - 1})`;
}
