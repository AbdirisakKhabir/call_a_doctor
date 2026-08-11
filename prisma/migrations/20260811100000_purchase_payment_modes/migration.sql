-- Purchase payment modes: pay now, receive without payment, or supplier credit
ALTER TABLE `purchases`
  ADD COLUMN `paymentStatus` VARCHAR(191) NOT NULL DEFAULT 'paid',
  ADD COLUMN `amountPaid` DOUBLE NOT NULL DEFAULT 0,
  ADD COLUMN `balanceDue` DOUBLE NOT NULL DEFAULT 0;

UPDATE `purchases`
SET
  `paymentStatus` = 'paid',
  `amountPaid` = `totalAmount`,
  `balanceDue` = 0
WHERE `totalAmount` > 0;

ALTER TABLE `suppliers`
  ADD COLUMN `creditBalance` DOUBLE NOT NULL DEFAULT 0;
