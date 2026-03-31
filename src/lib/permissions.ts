import { prisma } from "@/lib/prisma";

export async function userHasPermission(
  userId: number,
  permission: string
): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });
  if (!user?.isActive) return false;
  const names = user.role.permissions.map((rp) => rp.permission.name);
  return names.includes(permission);
}
