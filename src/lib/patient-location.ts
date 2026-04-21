import { prisma } from "@/lib/prisma";

export async function assertActiveBranch(id: number): Promise<boolean> {
  const b = await prisma.branch.findFirst({ where: { id, isActive: true } });
  return !!b;
}

/** Village must belong to city and both active. */
export async function assertVillageInCity(villageId: number, cityId: number): Promise<boolean> {
  const v = await prisma.village.findFirst({
    where: { id: villageId, cityId, isActive: true, city: { isActive: true } },
  });
  return !!v;
}

export async function assertActiveCity(cityId: number): Promise<boolean> {
  const c = await prisma.city.findFirst({ where: { id: cityId, isActive: true } });
  return !!c;
}
