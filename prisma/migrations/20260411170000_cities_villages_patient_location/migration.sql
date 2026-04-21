-- Cities & villages (Settings) + patient locality + registration branch.

CREATE TABLE `cities` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `cities_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `villages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cityId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `villages_cityId_idx`(`cityId`),
    UNIQUE INDEX `villages_cityId_name_key`(`cityId`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `villages` ADD CONSTRAINT `villages_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `patients` ADD COLUMN `cityId` INTEGER NULL;
ALTER TABLE `patients` ADD COLUMN `villageId` INTEGER NULL;
ALTER TABLE `patients` ADD COLUMN `registeredBranchId` INTEGER NULL;

ALTER TABLE `patients` ADD CONSTRAINT `patients_cityId_fkey` FOREIGN KEY (`cityId`) REFERENCES `cities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `patients` ADD CONSTRAINT `patients_villageId_fkey` FOREIGN KEY (`villageId`) REFERENCES `villages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `patients` ADD CONSTRAINT `patients_registeredBranchId_fkey` FOREIGN KEY (`registeredBranchId`) REFERENCES `branches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
