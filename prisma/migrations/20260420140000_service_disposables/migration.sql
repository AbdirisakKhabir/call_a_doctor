-- CreateTable
CREATE TABLE `service_disposables` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `serviceId` INTEGER NOT NULL,
    `productCode` VARCHAR(191) NOT NULL,
    `unitsPerService` DOUBLE NOT NULL DEFAULT 1,
    `deductionUnitKey` VARCHAR(191) NOT NULL DEFAULT 'base',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `service_disposables_serviceId_productCode_key`(`serviceId`, `productCode`),
    INDEX `service_disposables_serviceId_idx`(`serviceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `service_disposables` ADD CONSTRAINT `service_disposables_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `appointment_services` ADD COLUMN `disposablesDeductedAt` DATETIME(3) NULL;

ALTER TABLE `internal_stock_logs` ADD COLUMN `relatedAppointmentId` INTEGER NULL;
CREATE INDEX `internal_stock_logs_relatedAppointmentId_idx` ON `internal_stock_logs`(`relatedAppointmentId`);
CREATE INDEX `internal_stock_logs_purpose_createdAt_idx` ON `internal_stock_logs`(`purpose`, `createdAt`);
ALTER TABLE `internal_stock_logs` ADD CONSTRAINT `internal_stock_logs_relatedAppointmentId_fkey` FOREIGN KEY (`relatedAppointmentId`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
