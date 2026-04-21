-- Referral sources (Settings) + optional link on patients.

CREATE TABLE `referral_sources` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `referral_sources_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `patients` ADD COLUMN `referralSourceId` INTEGER NULL;
ALTER TABLE `patients` ADD CONSTRAINT `patients_referralSourceId_fkey` FOREIGN KEY (`referralSourceId`) REFERENCES `referral_sources`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
