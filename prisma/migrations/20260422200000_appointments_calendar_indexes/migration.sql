-- Improve calendar / range queries on appointments
CREATE INDEX `appointments_appointmentDate_idx` ON `appointments`(`appointmentDate`);
CREATE INDEX `appointments_branchId_appointmentDate_idx` ON `appointments`(`branchId`, `appointmentDate`);
