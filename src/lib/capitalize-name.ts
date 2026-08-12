/** Capitalize each word (e.g. "cbc test" → "Cbc Test", "paracetamol" → "Paracetamol"). */
export function capitalizeNamePart(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((word) => {
      if (!word) return word;
      return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
    })
    .join(" ");
}
