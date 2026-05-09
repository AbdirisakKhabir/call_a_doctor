ALTER TABLE `appointments`
  ADD COLUMN `completionChecklistLab` VARCHAR(191) NULL,
  ADD COLUMN `completionChecklistPrescription` VARCHAR(191) NULL,
  ADD COLUMN `completionChecklistClinicNote` VARCHAR(191) NULL;
