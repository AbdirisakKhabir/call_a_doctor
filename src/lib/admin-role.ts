/** Seeded role name for full system access; must match `prisma/seed.ts` Admin role. */
export const ADMIN_ROLE_NAME = "Admin" as const;

export function isAdminRoleName(roleName: string | null | undefined): boolean {
  return roleName === ADMIN_ROLE_NAME;
}
