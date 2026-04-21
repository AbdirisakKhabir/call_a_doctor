-- CreateTable
CREATE TABLE `product_sale_units` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `unitKey` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `baseUnitsEach` INTEGER NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `product_sale_units_productId_unitKey_key`(`productId`, `unitKey`),
    INDEX `product_sale_units_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_sale_units` ADD CONSTRAINT `product_sale_units_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- One "base" unit per product: stock quantity is in this unit (label from products.unit).
INSERT INTO `product_sale_units` (`productId`, `unitKey`, `label`, `baseUnitsEach`, `sortOrder`, `createdAt`, `updatedAt`)
SELECT
  `id`,
  'base',
  CASE
    WHEN `unit` IS NULL OR TRIM(`unit`) = '' THEN 'Unit'
    ELSE LEFT(TRIM(`unit`), 191)
  END,
  1,
  0,
  CURRENT_TIMESTAMP(3),
  CURRENT_TIMESTAMP(3)
FROM `products`;
