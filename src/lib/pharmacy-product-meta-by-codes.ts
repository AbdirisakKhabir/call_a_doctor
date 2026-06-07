import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function norm(code: string): string {
  return code.trim().toUpperCase();
}

/** Pharmacy product name/unit keyed by normalized code (same branch). */
export async function pharmacyProductMetaByNormalizedCodes(
  branchId: number,
  codes: string[]
): Promise<Map<string, { name: string; unit: string }>> {
  const uniq = [...new Set(codes.map((c) => norm(c)))].filter(Boolean);
  const out = new Map<string, { name: string; unit: string }>();
  if (uniq.length === 0) return out;

  const rows = await prisma.$queryRaw<Array<{ nu: string; name: string; unit: string }>>(
    Prisma.sql`
      SELECT UPPER(TRIM(\`code\`)) AS nu, \`name\`, \`unit\`
      FROM \`products\`
      WHERE \`branchId\` = ${branchId}
        AND \`isActive\` = 1
        AND UPPER(TRIM(\`code\`)) IN (${Prisma.join(uniq)})
    `
  );
  for (const r of rows) {
    out.set(r.nu, { name: r.name, unit: r.unit || "pcs" });
  }
  return out;
}
