/**
 * Age in full years from a calendar date of birth (YYYY-MM-DD), relative to `reference` (default: today).
 * Returns null if empty, invalid, or date of birth is in the future.
 */
export function calculateAgeFromIsoDateString(
  isoDate: string,
  reference: Date = new Date()
): number | null {
  const trimmed = isoDate?.trim();
  if (!trimmed) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const birth = new Date(y, mo - 1, d);
  if (Number.isNaN(birth.getTime())) return null;
  const refDay = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  if (birth > refDay) return null;

  let age = reference.getFullYear() - birth.getFullYear();
  const monthDiff = reference.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && reference.getDate() < birth.getDate())) {
    age--;
  }
  return age < 0 ? null : age;
}

/** Age from a `Date` (e.g. Prisma `dateOfBirth`); uses UTC calendar date. */
export function calculateAgeFromDate(value: Date | null | undefined): number | null {
  if (value == null || Number.isNaN(value.getTime())) return null;
  return calculateAgeFromIsoDateString(value.toISOString().slice(0, 10));
}
