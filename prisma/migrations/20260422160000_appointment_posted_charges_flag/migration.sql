-- Track whether booking creation incremented patient AR; false when visit billing sale posted at booking.
ALTER TABLE `appointments` ADD COLUMN `postedChargesToPatientOnCreate` BOOLEAN NOT NULL DEFAULT true;
