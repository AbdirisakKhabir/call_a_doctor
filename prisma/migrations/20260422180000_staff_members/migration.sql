-- CreateTable
CREATE TABLE `staff_members` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `address` TEXT NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `cvUrl` VARCHAR(191) NULL,
    `cvPublicId` VARCHAR(191) NULL,
    `hireDate` DATETIME(3) NOT NULL,
    `workingDays` TEXT NOT NULL,
    `workingHours` VARCHAR(191) NOT NULL,
    `salaryAmount` DOUBLE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `staff_members_hireDate_idx`(`hireDate`),
    INDEX `staff_members_isActive_idx`(`isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `staff_members` ADD CONSTRAINT `staff_members_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
