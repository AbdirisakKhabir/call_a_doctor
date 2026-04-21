/** Normalize stored service color to #RRGGBB or null. */
export function normalizeServiceColor(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(s);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

/** Readable text on top of a hex background (simple luminance). */
/** Background tint for panels (hex + alpha channel). */
export function hexWithAlpha(hex: string, alphaHex: string): string {
  const n = normalizeServiceColor(hex);
  if (!n) return "transparent";
  return `${n}${alphaHex}`;
}

export function contrastingForeground(bgHex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(bgHex.trim());
  if (!m) return "#111827";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? "#111827" : "#ffffff";
}
