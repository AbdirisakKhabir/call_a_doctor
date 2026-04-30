CREATE TABLE `appointment_schedule_blocks` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NULL,
    `startDate` DATE NOT NULL,
    `endDate` DATE NOT NULL,
    `allDay` BOOLEAN NOT NULL DEFAULT true,
    `startTime` VARCHAR(191) NULL,
    `endTime` VARCHAR(191) NULL,
    `label` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX `appointment_schedule_blocks_startDate_endDate_idx` ON `appointment_schedule_blocks`(`startDate`, `endDate`);
CREATE INDEX `appointment_schedule_blocks_branchId_idx` ON `appointment_schedule_blocks`(`branchId`);

ALTER TABLE `appointment_schedule_blocks` ADD CONSTRAINT `appointment_schedule_blocks_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
