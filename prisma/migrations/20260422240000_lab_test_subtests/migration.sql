-- AlterTable
ALTER TABLE `lab_tests` ADD COLUMN `parentTestId` INTEGER NULL;

-- AlterTable
ALTER TABLE `lab_order_items` ADD COLUMN `panelParentTestId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `lab_tests_parentTestId_idx` ON `lab_tests`(`parentTestId`);

-- CreateIndex
CREATE INDEX `lab_order_items_panelParentTestId_idx` ON `lab_order_items`(`panelParentTestId`);

-- AddForeignKey
ALTER TABLE `lab_tests` ADD CONSTRAINT `lab_tests_parentTestId_fkey` FOREIGN KEY (`parentTestId`) REFERENCES `lab_tests`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lab_order_items` ADD CONSTRAINT `lab_order_items_panelParentTestId_fkey` FOREIGN KEY (`panelParentTestId`) REFERENCES `lab_tests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
