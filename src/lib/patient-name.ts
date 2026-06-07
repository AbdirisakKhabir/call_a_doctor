/** Display name for clients (Patient model): "First Last", with single-name / legacy mononyms collapsed. */
export function formatClientFullName(p: { firstName: string; lastName: string }): string {
  const f = (p.firstName ?? "").trim();
  const l = (p.lastName ?? "").trim();
  if (!f && !l) return "";
  if (!l || f === l) return f || l;
  return `${f} ${l}`;
}

/** API JSON: keep `name` for list/detail views that still expect a single display string. */
export function serializePatient<P extends { firstName: string; lastName: string }>(
  p: P
): P & { name: string } {
  return { ...p, name: formatClientFullName(p) };
}
