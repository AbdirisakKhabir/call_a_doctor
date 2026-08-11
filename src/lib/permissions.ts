import { prisma } from "@/lib/prisma";
import { isAdminRoleName } from "@/lib/admin-role";
import { permissionGranted } from "@/lib/page-permissions";

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
  if (isAdminRoleName(user.role.name)) return true;
  const names = user.role.permissions.map((rp) => rp.permission.name);
  return permissionGranted(names, permission);
}
