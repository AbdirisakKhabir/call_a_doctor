-- Split legacy full name into firstName / lastName (MySQL).

ALTER TABLE `patients` ADD COLUMN `firstName` VARCHAR(191) NOT NULL DEFAULT '';
ALTER TABLE `patients` ADD COLUMN `lastName` VARCHAR(191) NOT NULL DEFAULT '';

UPDATE `patients`
SET
  `firstName` = CASE
    WHEN TRIM(`name`) = '' THEN 'Unknown'
    ELSE TRIM(SUBSTRING_INDEX(TRIM(`name`), ' ', 1))
  END,
  `lastName` = CASE
    WHEN TRIM(`name`) = '' THEN 'Unknown'
    WHEN LOCATE(' ', TRIM(`name`)) > 0 THEN TRIM(SUBSTRING(TRIM(`name`), LOCATE(' ', TRIM(`name`)) + 1))
    ELSE TRIM(`name`)
  END;

ALTER TABLE `patients` DROP COLUMN `name`;
