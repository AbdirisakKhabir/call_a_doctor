import { prisma } from "@/lib/prisma";
import { isAdminRoleName } from "@/lib/admin-role";

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
  // Admin role: full access (audit, settings, etc.) even if role_permissions is behind seed/migrations
  if (isAdminRoleName(user.role.name)) return true;
  const names = user.role.permissions.map((rp) => rp.permission.name);
  return names.includes(permission);
}
