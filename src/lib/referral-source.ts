import { prisma } from "@/lib/prisma";

/**
 * Resolves optional referral source id from API body.
 * - undefined: field omitted (PATCH: leave unchanged)
 * - null / "": clear
 * - number: must exist and be active (for assign)
 */
export async function resolveReferralSourceIdForWrite(
  raw: unknown
): Promise<{ ok: true; value: number | null | undefined } | { ok: false; error: string }> {
  if (typeof raw === "undefined") {
    return { ok: true, value: undefined };
  }
  if (raw === null || raw === "") {
    return { ok: true, value: null };
  }
  const id = Number(raw);
  if (!Number.isInteger(id) || id < 1) {
    return { ok: false, error: "Invalid referred from" };
  }
  const src = await prisma.referralSource.findFirst({
    where: { id, isActive: true },
  });
  if (!src) {
    return { ok: false, error: "Invalid or inactive referred from" };
  }
  return { ok: true, value: id };
}
