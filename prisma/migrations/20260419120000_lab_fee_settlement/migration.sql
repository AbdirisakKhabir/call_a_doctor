-- Lab orders: track reception payments + discounts toward the order fee; results blocked until settled.
-- Patient payments: optional discount and link to lab order.

ALTER TABLE `lab_orders` ADD COLUMN `labFeePaidAmount` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `lab_orders` ADD COLUMN `labFeeDiscountAmount` DOUBLE NOT NULL DEFAULT 0;

-- Grandfather existing orders as fully settled so result entry keeps working.
UPDATE `lab_orders` SET `labFeePaidAmount` = `totalAmount`;

ALTER TABLE `patient_payments` ADD COLUMN `discount` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `patient_payments` ADD COLUMN `labOrderId` INTEGER NULL;

CREATE INDEX `patient_payments_labOrderId_idx` ON `patient_payments`(`labOrderId`);

ALTER TABLE `patient_payments` ADD CONSTRAINT `patient_payments_labOrderId_fkey` FOREIGN KEY (`labOrderId`) REFERENCES `lab_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
