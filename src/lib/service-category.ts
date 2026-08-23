import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

export async function resolveServiceCategoryId(
  db: Db,
  raw: unknown
): Promise<{ id: number | null } | { error: string }> {
  if (raw === null || raw === "" || raw === undefined) {
    return { id: null };
  }
  const id = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { error: "Invalid service category" };
  }
  const row = await db.serviceCategory.findUnique({
    where: { id },
    select: { id: true, isActive: true },
  });
  if (!row) return { error: "Service category not found" };
  if (!row.isActive) return { error: "That service category is inactive" };
  return { id: row.id };
}

export function isPrismaUniqueError(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002");
}
