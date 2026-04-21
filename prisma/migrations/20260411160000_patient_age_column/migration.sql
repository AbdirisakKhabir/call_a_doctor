-- Persist calculated age (full years) for clients; kept in sync when dateOfBirth is saved.

ALTER TABLE `patients` ADD COLUMN `age` INTEGER NULL;

UPDATE `patients`
SET `age` = (
  YEAR(CURDATE()) - YEAR(`dateOfBirth`) - (
    DATE_FORMAT(CURDATE(), '%m%d') < DATE_FORMAT(`dateOfBirth`, '%m%d')
  )
)
WHERE `dateOfBirth` IS NOT NULL;
