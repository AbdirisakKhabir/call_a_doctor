-- Doctor visit cards + link doctors to users for scoped access + ledger deposit link

ALTER TABLE `doctors` ADD COLUMN `userId` INTEGER NULL UNIQUE;
ALTER TABLE `doctors` ADD CONSTRAINT `doctors_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE `doctor_visit_cards` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cardNumber` VARCHAR(191) NOT NULL,
    `branchId` INTEGER NOT NULL,
    `patientId` INTEGER NOT NULL,
    `doctorId` INTEGER NOT NULL,
    `visitDate` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'inWaiting',
    `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'unpaid',
    `visitFee` DOUBLE NOT NULL DEFAULT 0,
    `paymentMethodId` INTEGER NULL,
    `createdById` INTEGER NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `doctor_visit_cards_branchId_cardNumber_key`(`branchId`, `cardNumber`),
    INDEX `doctor_visit_cards_branchId_visitDate_idx`(`branchId`, `visitDate`),
    INDEX `doctor_visit_cards_doctorId_visitDate_idx`(`doctorId`, `visitDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_patientId_fkey` FOREIGN KEY (`patientId`) REFERENCES `patients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_doctorId_fkey` FOREIGN KEY (`doctorId`) REFERENCES `doctors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `ledger_payment_methods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `doctor_visit_cards` ADD CONSTRAINT `doctor_visit_cards_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `account_transactions` ADD COLUMN `doctorVisitCardId` INTEGER NULL UNIQUE;
ALTER TABLE `account_transactions` ADD CONSTRAINT `account_transactions_doctorVisitCardId_fkey` FOREIGN KEY (`doctorVisitCardId`) REFERENCES `doctor_visit_cards`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
