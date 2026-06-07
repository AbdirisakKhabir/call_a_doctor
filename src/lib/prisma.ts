import { PrismaClient } from "@prisma/client";
import { getDbAdapter } from "./db-adapter";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma() {
  const adapter = getDbAdapter();
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

export const prisma =
  globalForPrisma.prisma ||
  createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
