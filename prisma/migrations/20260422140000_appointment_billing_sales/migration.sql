-- Appointment visit billing: payment method on booking, link sales to appointment, optional product on sale line (service billing).
ALTER TABLE `sale_items` MODIFY `productId` INTEGER NULL;

ALTER TABLE `sale_items` ADD COLUMN `serviceId` INTEGER NULL;
CREATE INDEX `sale_items_serviceId_idx` ON `sale_items`(`serviceId`);
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_serviceId_fkey` FOREIGN KEY (`serviceId`) REFERENCES `services`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sales` ADD COLUMN `appointmentId` INTEGER NULL;
ALTER TABLE `sales` ADD COLUMN `kind` VARCHAR(191) NOT NULL DEFAULT 'pos';
CREATE INDEX `sales_appointmentId_idx` ON `sales`(`appointmentId`);
ALTER TABLE `sales` ADD CONSTRAINT `sales_appointmentId_fkey` FOREIGN KEY (`appointmentId`) REFERENCES `appointments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `appointments` ADD COLUMN `paymentMethodId` INTEGER NULL;
CREATE INDEX `appointments_paymentMethodId_idx` ON `appointments`(`paymentMethodId`);
ALTER TABLE `appointments` ADD CONSTRAINT `appointments_paymentMethodId_fkey` FOREIGN KEY (`paymentMethodId`) REFERENCES `ledger_payment_methods`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
