-- Allow recording purchases without linking a supplier (e.g. donations, informal receipts).
ALTER TABLE "purchases" ALTER COLUMN "supplierId" DROP NOT NULL;
