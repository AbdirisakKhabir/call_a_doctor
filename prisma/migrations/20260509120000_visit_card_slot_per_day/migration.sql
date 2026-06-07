-- Allow reusing card numbers on different days; enforce uniqueness per branch + calendar date + card number.

DROP INDEX `doctor_visit_cards_branchId_cardNumber_key` ON `doctor_visit_cards`;

CREATE UNIQUE INDEX `doctor_visit_cards_branchId_visitDate_cardNumber_key` ON `doctor_visit_cards` (`branchId`, `visitDate`, `cardNumber`);
