-- AlterTable
ALTER TABLE `products` ADD COLUMN `unsellableQuantity` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `unsellable_stock_logs` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `productId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `unsellable_stock_logs_branchId_createdAt_idx`(`branchId`, `createdAt`),
    INDEX `unsellable_stock_logs_productId_idx`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `unsellable_stock_logs` ADD CONSTRAINT `unsellable_stock_logs_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unsellable_stock_logs` ADD CONSTRAINT `unsellable_stock_logs_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `unsellable_stock_logs` ADD CONSTRAINT `unsellable_stock_logs_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
