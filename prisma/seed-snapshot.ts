/**
 * Full-database snapshot for Prisma seed / restore.
 *
 * Workflow:
 * 1. Point DATABASE_URL at your LOCAL database.
 * 2. Run: npm run db:export-seed
 *    → writes prisma/seed-data/snapshot.json (add to .gitignore if it contains real data).
 * 3. On LIVE: run migrations first (prisma migrate deploy), then:
 *    SEED_SNAPSHOT=1 SEED_SNAPSHOT_TRUNCATE=1 npm run db:seed
 *    Optional: SEED_SNAPSHOT_PATH=/path/to/snapshot.json
 *
 * SEED_SNAPSHOT_TRUNCATE=1 deletes ALL rows from every table before import — only use on empty/staging DBs.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import type { PrismaClient } from "@prisma/client";

export const SNAPSHOT_VERSION = 1;

/** Prisma client delegate keys — export/import order (parents before children where possible). */
export const SNAPSHOT_DELEGATES_ORDER = [
  "permission",
  "role",
  "rolePermission",
  "appSettings",
  "referralSource",
  "city",
  "village",
  "branch",
  "financeAccount",
  "ledgerPaymentMethod",
  "user",
  "userBranch",
  "doctor",
  "service",
  "serviceDisposable",
  "category",
  "supplier",
  "product",
  "productSaleUnit",
  "patient",
  "patientCareFile",
  "expenseCategory",
  "expense",
  "labCategory",
  "labTest",
  "labTestDisposable",
  "labInventoryItem",
  "labInventoryUnit",
  "appointment",
  "appointmentService",
  "doctorVisitCard",
  "internalStockLog",
  "unsellableStockLog",
  "purchase",
  "purchaseItem",
  "sale",
  "saleItem",
  "pharmacySaleReturn",
  "pharmacySaleReturnItem",
  "outreachTeam",
  "outreachTeamMember",
  "outreachInventoryItem",
  "outreachReturn",
  "outreachReturnItem",
  "outreachDispense",
  "outreachDispenseItem",
  "labOrder",
  "labOrderItem",
  "prescription",
  "prescriptionItem",
  "labSale",
  "labSaleItem",
  "labStockMovement",
  "patientPayment",
  "patientHistory",
  "accountTransaction",
  "auditLog",
] as const;

/** Physical table names (@@map) — used for truncate/delete-all. */
const SQL_TABLE_NAMES = [
  "audit_logs",
  "account_transactions",
  "patient_histories",
  "patient_payments",
  "lab_stock_movements",
  "lab_sale_items",
  "lab_sales",
  "prescription_items",
  "prescriptions",
  "lab_order_items",
  "lab_orders",
  "outreach_dispense_items",
  "outreach_dispenses",
  "outreach_return_items",
  "outreach_returns",
  "outreach_inventory_items",
  "outreach_team_members",
  "outreach_teams",
  "pharmacy_sale_return_items",
  "pharmacy_sale_returns",
  "sale_items",
  "sales",
  "purchase_items",
  "purchases",
  "unsellable_stock_logs",
  "internal_stock_logs",
  "doctor_visit_cards",
  "appointment_services",
  "appointments",
  "lab_inventory_units",
  "lab_inventory_items",
  "lab_test_disposables",
  "lab_tests",
  "lab_categories",
  "expenses",
  "expense_categories",
  "patient_care_files",
  "patients",
  "product_sale_units",
  "products",
  "suppliers",
  "categories",
  "service_disposables",
  "services",
  "doctors",
  "user_branches",
  "users",
  "ledger_payment_methods",
  "finance_accounts",
  "villages",
  "cities",
  "referral_sources",
  "app_settings",
  "role_permissions",
  "roles",
  "permissions",
] as const;

export type SeedSnapshotFile = {
  version: number;
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

const BATCH = 300;

function getDelegate(prisma: PrismaClient, key: string): { createMany: (args: { data: unknown[] }) => Promise<unknown> } | null {
  const d = (prisma as unknown as Record<string, unknown>)[key];
  if (d && typeof d === "object" && d !== null && "createMany" in d && typeof (d as { createMany: unknown }).createMany === "function") {
    return d as { createMany: (args: { data: unknown[] }) => Promise<unknown> };
  }
  return null;
}

function getFindMany(prisma: PrismaClient, key: string): (() => Promise<unknown[]>) | null {
  const d = (prisma as unknown as Record<string, unknown>)[key];
  if (d && typeof d === "object" && d !== null && "findMany" in d && typeof (d as { findMany: unknown }).findMany === "function") {
    return () => (d as { findMany: () => Promise<unknown[]> }).findMany();
  }
  return null;
}

export async function exportSeedSnapshot(prisma: PrismaClient, outPath: string): Promise<void> {
  const dir = path.dirname(outPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const tables: Record<string, unknown[]> = {};
  for (const key of SNAPSHOT_DELEGATES_ORDER) {
    const findMany = getFindMany(prisma, key);
    if (!findMany) {
      console.warn(`[export-seed] skip unknown delegate: ${key}`);
      continue;
    }
    const rows = await findMany();
    tables[key] = rows as unknown[];
    console.log(`[export-seed] ${key}: ${(rows as unknown[]).length} rows`);
  }

  const payload: SeedSnapshotFile = {
    version: SNAPSHOT_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  };
  writeFileSync(outPath, JSON.stringify(payload, null, 0), "utf8");
  console.log(`[export-seed] wrote ${outPath}`);
}

export async function applySeedSnapshot(
  prisma: PrismaClient,
  filePath: string,
  options: { truncate?: boolean } = {}
): Promise<void> {
  const raw = readFileSync(filePath, "utf8");
  const snapshot = JSON.parse(raw) as SeedSnapshotFile;
  if (snapshot.version !== SNAPSHOT_VERSION) {
    throw new Error(`Unsupported snapshot version ${snapshot.version} (expected ${SNAPSHOT_VERSION})`);
  }
  if (!snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("Invalid snapshot: missing tables");
  }

  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=0");

  if (options.truncate) {
    for (const table of SQL_TABLE_NAMES) {
      await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    }
    console.log("[seed-snapshot] all tables cleared (DELETE)");
  }

  for (const key of SNAPSHOT_DELEGATES_ORDER) {
    const rows = snapshot.tables[key];
    if (!Array.isArray(rows) || rows.length === 0) continue;
    const delegate = getDelegate(prisma, key);
    if (!delegate) {
      console.warn(`[seed-snapshot] skip unknown delegate: ${key}`);
      continue;
    }
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH) as Record<string, unknown>[];
      await delegate.createMany({ data: chunk });
    }
    console.log(`[seed-snapshot] imported ${key}: ${rows.length} rows`);
  }

  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS=1");
  console.log("[seed-snapshot] done");
}

export function defaultSnapshotPath(): string {
  return path.join(process.cwd(), "prisma/seed-data/snapshot.json");
}
