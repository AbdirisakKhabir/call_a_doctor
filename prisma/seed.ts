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
  { name: "faculties.view", description: "View faculties", module: "faculties" },
  { name: "faculties.create", description: "Create faculties", module: "faculties" },
  { name: "faculties.edit", description: "Edit faculties", module: "faculties" },
  { name: "faculties.delete", description: "Delete faculties", module: "faculties" },
  { name: "departments.view", description: "View departments", module: "departments" },
  { name: "departments.create", description: "Create departments", module: "departments" },
  { name: "departments.edit", description: "Edit departments", module: "departments" },
  { name: "departments.delete", description: "Delete departments", module: "departments" },
  { name: "courses.view", description: "View courses", module: "courses" },
  { name: "courses.create", description: "Create courses", module: "courses" },
  { name: "courses.edit", description: "Edit courses", module: "courses" },
  { name: "courses.delete", description: "Delete courses", module: "courses" },
  { name: "classes.view", description: "View classes", module: "classes" },
  { name: "classes.create", description: "Create classes", module: "classes" },
  { name: "classes.edit", description: "Edit classes", module: "classes" },
  { name: "classes.delete", description: "Delete classes", module: "classes" },
  { name: "admission.view", description: "View student admissions", module: "admission" },
  { name: "admission.create", description: "Create student admissions", module: "admission" },
  { name: "admission.edit", description: "Edit student admissions", module: "admission" },
  { name: "admission.delete", description: "Delete student admissions", module: "admission" },
  { name: "attendance.view", description: "View attendance", module: "attendance" },
  { name: "attendance.create", description: "Take attendance", module: "attendance" },
  { name: "attendance.edit", description: "Edit attendance", module: "attendance" },
  { name: "attendance.delete", description: "Delete attendance sessions", module: "attendance" },
  { name: "examinations.view", description: "View examination records", module: "examinations" },
  { name: "examinations.create", description: "Create examination records", module: "examinations" },
  { name: "examinations.edit", description: "Edit examination records", module: "examinations" },
  { name: "examinations.delete", description: "Delete examination records", module: "examinations" },
  { name: "reports.view", description: "View reports", module: "reports" },
  { name: "finance.view", description: "View finance", module: "finance" },
  { name: "finance.create", description: "Record tuition payments", module: "finance" },
  { name: "semesters.view", description: "View semesters", module: "semesters" },
  { name: "semesters.create", description: "Create semesters", module: "semesters" },
  { name: "semesters.edit", description: "Edit semesters", module: "semesters" },
  { name: "semesters.delete", description: "Delete semesters", module: "semesters" },
  { name: "lecturers.view", description: "View lecturers", module: "lecturers" },
  { name: "lecturers.create", description: "Create lecturers", module: "lecturers" },
  { name: "lecturers.edit", description: "Edit lecturers", module: "lecturers" },
  { name: "lecturers.delete", description: "Delete lecturers", module: "lecturers" },
];

async function main() {
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

  // Create default semesters (Fall, Spring, Summer)
  const defaultSemesters = [
    { name: "Spring", sortOrder: 1 },
    { name: "Summer", sortOrder: 2 },
    { name: "Fall", sortOrder: 3 },
  ];
  for (const s of defaultSemesters) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).semester.upsert({
      where: { name: s.name },
      create: { name: s.name, sortOrder: s.sortOrder },
      update: { sortOrder: s.sortOrder },
    });
  }

  const hashed = await bcrypt.hash("admin123", 10);
  await prisma.user.upsert({
    where: { email: "admin@abaarsotech.edu" },
    create: {
      email: "admin@abaarsotech.edu",
      password: hashed,
      name: "System Admin",
      roleId: adminRole.id,
    },
    update: {},
  });

  console.log("Seed completed. Admin user: admin@abaarsotech.edu / admin123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
