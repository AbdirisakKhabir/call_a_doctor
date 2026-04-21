-- CreateTable
CREATE TABLE `patient_care_files` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `patientId` INTEGER NOT NULL,
    `fileCode` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'open',
    `openedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `closedAt` DATETIME(3) NULL,
    `invoicedAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `patient_care_files_fileCode_key`(`fileCode`),
    INDEX `patient_care_files_patientId_status_idx`(`patientId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `patient_care_files` ADD CONSTRAINT `patient_care_files_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `appointments` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `appointments_careFileId_idx` ON `appointments`(`careFileId`);
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `lab_orders` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `lab_orders_careFileId_idx` ON `lab_orders`(`careFileId`);
ALTER TABLE `lab_orders` ADD CONSTRAINT `lab_orders_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `prescriptions` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `prescriptions_careFileId_idx` ON `prescriptions`(`careFileId`);
ALTER TABLE `prescriptions` ADD CONSTRAINT `prescriptions_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `patient_histories` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `patient_histories_careFileId_idx` ON `patient_histories`(`careFileId`);
ALTER TABLE `patient_histories` ADD CONSTRAINT `patient_histories_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `doctor_visit_cards` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `doctor_visit_cards_careFileId_idx` ON `doctor_visit_cards`(`careFileId`);
ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `patient_payments` ADD COLUMN `careFileId` INTEGER NULL;
CREATE INDEX `patient_payments_careFileId_idx` ON `patient_payments`(`careFileId`);
ALTER TABLE `patient_payments` ADD CONSTRAINT `patient_payments_careFileId_fkey` FOREIGN KEY (`careFileId`) REFERENCES `patient_care_files`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
