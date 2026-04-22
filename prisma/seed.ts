import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import bcrypt from "bcryptjs";

const DEFAULT_PERMISSIONS = [
  { name: "users.view", description: "View users", module: "users" },
  { name: "users.create", description: "Create users", module: "users" },
  { name: "users.edit", description: "Edit users", module: "users" },
  { name: "users.delete", description: "Delete users", module: "users" },
  { name: "roles.view", description: "View roles", module: "roles" },
  { name: "roles.create", description: "Create roles", module: "roles" },
  { name: "roles.edit", description: "Edit roles", module: "roles" },
  { name: "roles.delete", description: "Delete roles", module: "roles" },
  { name: "permissions.view", description: "View permissions", module: "permissions" },
  { name: "dashboard.view", description: "View dashboard", module: "dashboard" },
  { name: "pharmacy.view", description: "View pharmacy", module: "pharmacy" },
  { name: "pharmacy.create", description: "Create pharmacy records", module: "pharmacy" },
  { name: "pharmacy.edit", description: "Edit pharmacy records", module: "pharmacy" },
  { name: "pharmacy.delete", description: "Delete pharmacy records", module: "pharmacy" },
  { name: "pharmacy.pos", description: "Use POS system", module: "pharmacy" },
  { name: "patients.view", description: "View clients", module: "patients" },
  { name: "patients.create", description: "Create clients", module: "patients" },
  { name: "patients.edit", description: "Edit clients", module: "patients" },
  { name: "patients.delete", description: "Delete clients", module: "patients" },
  { name: "appointments.view", description: "View appointments", module: "appointments" },
  { name: "appointments.create", description: "Create appointments", module: "appointments" },
  { name: "appointments.edit", description: "Edit appointments", module: "appointments" },
  { name: "appointments.delete", description: "Delete appointments", module: "appointments" },
  { name: "lab.view", description: "View lab", module: "lab" },
  { name: "lab.create", description: "Create lab orders and manage tests", module: "lab" },
  { name: "lab.edit", description: "Edit lab and record results", module: "lab" },
  { name: "lab.delete", description: "Delete lab records", module: "lab" },
  { name: "prescriptions.view", description: "View prescriptions", module: "prescriptions" },
  { name: "prescriptions.create", description: "Create prescriptions", module: "prescriptions" },
  { name: "prescriptions.edit", description: "Edit prescriptions", module: "prescriptions" },
  { name: "prescriptions.delete", description: "Delete prescriptions", module: "prescriptions" },
  { name: "patient_history.view", description: "View client history", module: "patients" },
  { name: "patient_history.create", description: "Record client history", module: "patients" },
  { name: "expenses.view", description: "View expenses", module: "expenses" },
  { name: "expenses.create", description: "Create expenses", module: "expenses" },
  { name: "expenses.edit", description: "Edit expenses", module: "expenses" },
  { name: "expenses.delete", description: "Delete expenses", module: "expenses" },
  { name: "financial.view", description: "View financial reports", module: "financial" },
  { name: "settings.view", description: "Access settings menu and overview", module: "settings" },
  { name: "settings.manage", description: "Manage branches and user branch access", module: "settings" },
  { name: "accounts.view", description: "View finance accounts and transactions", module: "accounts" },
  { name: "accounts.manage", description: "Create and edit accounts and payment methods", module: "accounts" },
  { name: "accounts.deposit", description: "Record deposits from pharmacy sales", module: "accounts" },
  { name: "accounts.withdraw", description: "Record withdrawals from accounts", module: "accounts" },
  { name: "accounts.reports", description: "View account transaction statements", module: "accounts" },
  { name: "visit_cards.view_all", description: "View all doctor visit cards", module: "visit_cards" },
  { name: "visit_cards.view_own", description: "View only visit cards assigned to linked doctor", module: "visit_cards" },
  { name: "visit_cards.create", description: "Create doctor visit cards (reception)", module: "visit_cards" },
  { name: "visit_cards.edit", description: "Edit visit card status and payment", module: "visit_cards" },
  { name: "audit.view", description: "View user activity and audit log", module: "audit" },
  {
    name: "audit.view_admins",
    description: "View audit log for Administrator accounts only (oversight without full staff log)",
    module: "audit",
  },
];

async function main() {
  if (process.env.SEED_SNAPSHOT === "1") {
    const { applySeedSnapshot, defaultSnapshotPath } = await import("./seed-snapshot");
    const filePath = process.env.SEED_SNAPSHOT_PATH || defaultSnapshotPath();
    const truncate = process.env.SEED_SNAPSHOT_TRUNCATE === "1";
    console.log(`SEED_SNAPSHOT: loading ${filePath} (truncate all app tables first: ${truncate})`);
    await applySeedSnapshot(prisma, filePath, { truncate });
    console.log("SEED_SNAPSHOT: finished.");
    return;
  }

  // Create permissions
  for (const p of DEFAULT_PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: p.name },
      create: p,
      update: {},
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const adminRole = await prisma.role.upsert({
    where: { name: "Admin" },
    create: {
      name: "Admin",
      description: "Full system access",
    },
    update: {},
  });

  // Assign all permissions to Admin
  for (const perm of allPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
      },
      update: {},
    });
  }

  const hashed = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@clinic.local" },
    create: {
      email: "admin@clinic.local",
      password: hashed,
      name: "Clinic Admin",
      roleId: adminRole.id,
    },
    update: {},
  });

  // Staff role for self-registered users (dashboard access only)
  const dashboardPerm = allPermissions.find((p) => p.name === "dashboard.view");
  const staffRole = await prisma.role.upsert({
    where: { name: "Staff" },
    create: { name: "Staff", description: "Default role for newly registered staff" },
    update: {},
  });
  if (dashboardPerm) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: staffRole.id, permissionId: dashboardPerm.id } },
      create: { roleId: staffRole.id, permissionId: dashboardPerm.id },
      update: {},
    });
  }

  const visitViewAll = allPermissions.find((p) => p.name === "visit_cards.view_all");
  const visitViewOwn = allPermissions.find((p) => p.name === "visit_cards.view_own");
  const visitCreate = allPermissions.find((p) => p.name === "visit_cards.create");
  const visitEdit = allPermissions.find((p) => p.name === "visit_cards.edit");
  const accountsDeposit = allPermissions.find((p) => p.name === "accounts.deposit");

  const doctorRole = await prisma.role.upsert({
    where: { name: "Doctor" },
    create: { name: "Doctor", description: "Sees only assigned visit cards" },
    update: {},
  });
  for (const perm of [visitViewOwn, dashboardPerm].filter(Boolean) as { id: number }[]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: doctorRole.id, permissionId: perm.id } },
      create: { roleId: doctorRole.id, permissionId: perm.id },
      update: {},
    });
  }

  const receptionRole = await prisma.role.upsert({
    where: { name: "Reception" },
    create: { name: "Reception", description: "Front desk: visit cards, clients" },
    update: {},
  });
  for (const perm of [
    visitViewAll,
    visitCreate,
    visitEdit,
    accountsDeposit,
    allPermissions.find((p) => p.name === "accounts.view"),
    dashboardPerm,
    allPermissions.find((p) => p.name === "patients.view"),
    allPermissions.find((p) => p.name === "patients.create"),
    allPermissions.find((p) => p.name === "appointments.view"),
  ].filter(Boolean) as { id: number }[]) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: receptionRole.id, permissionId: perm.id } },
      create: { roleId: receptionRole.id, permissionId: perm.id },
      update: {},
    });
  }

  console.log("Seed completed. Admin: admin@clinic.local / admin123");
  console.log("Roles: Admin, Staff, Doctor, Reception created/updated.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
