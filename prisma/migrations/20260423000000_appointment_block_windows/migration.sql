-- Time windows per schedule block (multiple ranges per day, e.g. 9–10, 13–15, 18–21:30)

CREATE TABLE `appointment_schedule_block_windows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `blockId` INTEGER NOT NULL,
    `startTime` VARCHAR(191) NOT NULL,
    `endTime` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    INDEX `appointment_schedule_block_windows_blockId_idx`(`blockId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `appointment_schedule_block_windows` ADD CONSTRAINT `appointment_schedule_block_windows_blockId_fkey` FOREIGN KEY (`blockId`) REFERENCES `appointment_schedule_blocks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO `appointment_schedule_block_windows` (`blockId`, `startTime`, `endTime`, `sortOrder`)
SELECT `id`, `startTime`, `endTime`, 0 FROM `appointment_schedule_blocks`
WHERE `allDay` = 0 AND `startTime` IS NOT NULL AND `endTime` IS NOT NULL AND `startTime` != '' AND `endTime` != '';

ALTER TABLE `appointment_schedule_blocks` DROP COLUMN `startTime`, DROP COLUMN `endTime`;
