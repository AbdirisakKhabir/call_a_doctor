-- AlterTable
ALTER TABLE `products` ADD COLUMN `boxesPerCarton` INTEGER NULL,
    ADD COLUMN `pcsPerBox` INTEGER NULL;

-- AlterTable
ALTER TABLE `purchase_items` ADD COLUMN `purchaseUnit` VARCHAR(191) NOT NULL DEFAULT 'pcs';

-- AlterTable
ALTER TABLE `sale_items` ADD COLUMN `saleUnit` VARCHAR(191) NOT NULL DEFAULT 'pcs';
