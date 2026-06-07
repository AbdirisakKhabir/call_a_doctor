-- AlterTable
ALTER TABLE `custom_forms` ADD COLUMN `serviceId` INTEGER NULL;

-- CreateIndex
CREATE INDEX `custom_forms_serviceId_idx` ON `custom_forms`(`serviceId`);

-- AddForeignKey
ALTER TABLE `custom_forms` ADD CONSTRAINT `custom_forms_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
