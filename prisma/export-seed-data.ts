import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { defaultSnapshotPath, exportSeedSnapshot } from "./seed-snapshot";

const out = process.env.SEED_EXPORT_PATH ?? defaultSnapshotPath();

exportSeedSnapshot(prisma, out)
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
