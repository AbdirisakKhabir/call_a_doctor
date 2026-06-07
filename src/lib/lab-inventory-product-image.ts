import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Attach `imageUrl` from pharmacy `Product` at the same branch when product code matches (case-insensitive).
 */
export async function enrichLabItemsWithProductImages<T extends { code: string }>(
  branchId: number,
  items: T[]
): Promise<(T & { imageUrl: string | null })[]> {
  if (items.length === 0) return [];

  const uniq = [...new Set(items.map((i) => normalizeCode(i.code)))].filter(Boolean);
  if (uniq.length === 0) {
    return items.map((item) => ({ ...item, imageUrl: null }));
  }

  const rows = await prisma.$queryRaw<Array<{ nu: string; imageUrl: string | null }>>(
    Prisma.sql`
      SELECT UPPER(TRIM(\`code\`)) AS nu, \`imageUrl\`
      FROM \`products\`
      WHERE \`branchId\` = ${branchId}
        AND \`isActive\` = 1
        AND UPPER(TRIM(\`code\`)) IN (${Prisma.join(uniq)})
    `
  );

  const map = new Map(rows.map((r) => [r.nu, r.imageUrl]));
  return items.map((item) => ({
    ...item,
    imageUrl: map.get(normalizeCode(item.code)) ?? null,
  }));
}
