import type { Prisma, PrismaClient } from "@prisma/client";

export const TRASH_RETENTION_DAYS = 30;

export function computePurgeAt(deletedAt: Date = new Date()): Date {
  const d = new Date(deletedAt.getTime());
  d.setUTCDate(d.getUTCDate() + TRASH_RETENTION_DAYS);
  return d;
}

/** Serialize for JSON column (Dates → ISO strings). */
export function toTrashSnapshot<T>(row: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue;
}

type RecordTrashInput = {
  entityType: string;
  recordId: number;
  title: string;
  detail?: string | null;
  snapshot: Prisma.InputJsonValue;
  deletedById?: number | null;
};

export async function recordTrashEntry(
  tx: Prisma.TransactionClient,
  input: RecordTrashInput
): Promise<void> {
  const deletedAt = new Date();
  await tx.trashItem.create({
    data: {
      entityType: input.entityType,
      recordId: input.recordId,
      title: input.title.slice(0, 512),
      detail: input.detail ? String(input.detail).slice(0, 1024) : null,
      snapshot: input.snapshot,
      deletedById: input.deletedById ?? null,
      deletedAt,
      purgeAt: computePurgeAt(deletedAt),
    },
  });
}

/** Removes trash tombstones past retention. Returns how many rows were deleted. */
export async function purgeExpiredTrashItems(
  db: PrismaClient | Prisma.TransactionClient
): Promise<number> {
  const r = await db.trashItem.deleteMany({
    where: { purgeAt: { lte: new Date() } },
  });
  return r.count;
}

export function canManageTrash(userId: number | undefined, hasPermission: (p: string) => boolean): boolean {
  if (!userId) return false;
  return hasPermission("settings.manage");
}
