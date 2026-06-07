-- CreateTable
CREATE TABLE `lab_inventory_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `unit` VARCHAR(191) NOT NULL DEFAULT 'pcs',
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `sellingPrice` DOUBLE NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lab_inventory_items_branchId_code_key`(`branchId`, `code`),
    INDEX `lab_inventory_items_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_sales` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `saleDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `totalAmount` DOUBLE NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT '',
    `patientId` INTEGER NULL,
    `customerType` VARCHAR(191) NOT NULL DEFAULT 'walking',
    `notes` VARCHAR(191) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `lab_sales_branchId_saleDate_idx`(`branchId`, `saleDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_sale_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `labSaleId` INTEGER NOT NULL,
    `labInventoryItemId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitPrice` DOUBLE NOT NULL,
    `totalAmount` DOUBLE NOT NULL,

    INDEX `lab_sale_items_labSaleId_idx`(`labSaleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lab_stock_movements` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `labInventoryItemId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `signedQuantity` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `labOrderItemId` INTEGER NULL,
    `labSaleId` INTEGER NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `lab_stock_movements_branchId_createdAt_idx`(`branchId`, `createdAt`),
    INDEX `lab_stock_movements_labInventoryItemId_createdAt_idx`(`labInventoryItemId`, `createdAt`),
    INDEX `lab_stock_movements_reason_createdAt_idx`(`reason`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_inventory_items` ADD CONSTRAINT `lab_inventory_items_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sales` ADD CONSTRAINT `lab_sales_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sales` ADD CONSTRAINT `lab_sales_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sales` ADD CONSTRAINT `lab_sales_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sale_items` ADD CONSTRAINT `lab_sale_items_labSaleId_fkey` FOREIGN KEY (`labSaleId`) REFERENCES `lab_sales`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_sale_items` ADD CONSTRAINT `lab_sale_items_labInventoryItemId_fkey` FOREIGN KEY (`labInventoryItemId`) REFERENCES `lab_inventory_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_stock_movements` ADD CONSTRAINT `lab_stock_movements_labInventoryItemId_fkey` FOREIGN KEY (`labInventoryItemId`) REFERENCES `lab_inventory_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_stock_movements` ADD CONSTRAINT `lab_stock_movements_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_stock_movements` ADD CONSTRAINT `lab_stock_movements_labOrderItemId_fkey` FOREIGN KEY (`labOrderItemId`) REFERENCES `lab_order_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_stock_movements` ADD CONSTRAINT `lab_stock_movements_labSaleId_fkey` FOREIGN KEY (`labSaleId`) REFERENCES `lab_sales`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_stock_movements` ADD CONSTRAINT `lab_stock_movements_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
