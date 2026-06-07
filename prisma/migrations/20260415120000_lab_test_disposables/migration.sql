-- CreateTable
CREATE TABLE `lab_test_disposables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `labTestId` INTEGER NOT NULL,
    `productCode` VARCHAR(191) NOT NULL,
    `unitsPerTest` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lab_test_disposables_labTestId_productCode_key`(`labTestId`, `productCode`),
    INDEX `lab_test_disposables_labTestId_idx`(`labTestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `lab_test_disposables` ADD CONSTRAINT `lab_test_disposables_labTestId_fkey` FOREIGN KEY (`labTestId`) REFERENCES `lab_tests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `lab_order_items` ADD COLUMN `disposablesDeductedAt` DATETIME(3) NULL;
