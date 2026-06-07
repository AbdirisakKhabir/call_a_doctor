import type { Prisma } from "@prisma/client";

/** Published forms visible when filling forms for a booking with the given service lines. */
export function publishedFormsWhereForServices(serviceIds: number[]): Prisma.CustomFormWhereInput {
  const ids = [...new Set(serviceIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (ids.length === 0) {
    return { isPublished: true, serviceId: null };
  }
  return {
    isPublished: true,
    OR: [{ serviceId: null }, { serviceId: { in: ids } }],
  };
}
