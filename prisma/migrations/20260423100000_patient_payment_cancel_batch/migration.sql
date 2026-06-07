-- Client payment cancellation: batch id for ledger link; soft-cancel + restore balance.

ALTER TABLE `patient_payments` ADD COLUMN `batchGroupId` VARCHAR(36) NULL;
ALTER TABLE `patient_payments` ADD COLUMN `cancelledAt` DATETIME(3) NULL;
ALTER TABLE `patient_payments` ADD COLUMN `cancelledById` INTEGER NULL;

CREATE INDEX `patient_payments_patientId_batchGroupId_idx` ON `patient_payments`(`patientId`, `batchGroupId`);
CREATE INDEX `patient_payments_cancelledAt_idx` ON `patient_payments`(`cancelledAt`);

ALTER TABLE `patient_payments` ADD CONSTRAINT `patient_payments_cancelledById_fkey` FOREIGN KEY (`cancelledById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `account_transactions` ADD COLUMN `patientPaymentBatchId` VARCHAR(36) NULL;

CREATE INDEX `account_transactions_patientPaymentBatchId_idx` ON `account_transactions`(`patientPaymentBatchId`);
