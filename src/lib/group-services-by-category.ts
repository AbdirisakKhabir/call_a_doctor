export type ServiceCategoryRef = { id: number; name: string } | null | undefined;

export function groupServicesByCategory<T extends { category?: ServiceCategoryRef }>(
  items: T[]
): { label: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  const uncategorized: T[] = [];
  for (const item of items) {
    const label = item.category?.name?.trim();
    if (!label) {
      uncategorized.push(item);
      continue;
    }
    const list = map.get(label) ?? [];
    list.push(item);
    map.set(label, list);
  }
  const groups = [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, grouped]) => ({ label, items: grouped }));
  if (uncategorized.length) groups.push({ label: "Uncategorized", items: uncategorized });
  return groups;
}
