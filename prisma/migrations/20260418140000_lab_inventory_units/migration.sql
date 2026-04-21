-- CreateTable
CREATE TABLE `lab_inventory_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `labInventoryItemId` INTEGER NOT NULL,
    `unitKey` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `baseUnitsEach` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lab_inventory_units_labInventoryItemId_unitKey_key`(`labInventoryItemId`, `unitKey`),
    INDEX `lab_inventory_units_labInventoryItemId_idx`(`labInventoryItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_inventory_units` ADD CONSTRAINT `lab_inventory_units_labInventoryItemId_fkey` FOREIGN KEY (`labInventoryItemId`) REFERENCES `lab_inventory_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- One base unit per existing lab line (quantity is already in base units).
INSERT INTO `lab_inventory_units` (`labInventoryItemId`, `unitKey`, `label`, `baseUnitsEach`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT
  `id`,
  'base',
  CASE
    WHEN `unit` IS NULL OR TRIM(`unit`) = '' THEN 'pcs'
    ELSE LEFT(TRIM(`unit`), 191)
  END,
  1,
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `lab_inventory_items`;

-- AlterTable
ALTER TABLE `lab_test_disposables` ADD COLUMN `deductionUnitKey` VARCHAR(191) NOT NULL DEFAULT 'base';
