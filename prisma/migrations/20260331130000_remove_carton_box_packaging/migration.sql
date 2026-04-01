-- Normalize historical line quantities to pieces before removing product packaging fields.
UPDATE `sale_items` AS si
INNER JOIN `products` AS p ON si.`productId` = p.`id`
SET
  si.`quantity` = CASE
    WHEN si.`saleUnit` = 'pcs' THEN si.`quantity`
    WHEN si.`saleUnit` = 'box' AND p.`pcsPerBox` IS NOT NULL AND p.`pcsPerBox` > 0 THEN si.`quantity` * p.`pcsPerBox`
    WHEN si.`saleUnit` = 'carton'
      AND p.`boxesPerCarton` IS NOT NULL
      AND p.`pcsPerBox` IS NOT NULL
      AND p.`boxesPerCarton` > 0
      AND p.`pcsPerBox` > 0
      THEN si.`quantity` * p.`boxesPerCarton` * p.`pcsPerBox`
    ELSE si.`quantity`
  END,
  si.`saleUnit` = 'pcs'
WHERE si.`saleUnit` IN ('box', 'carton');

UPDATE `purchase_items` AS pi
INNER JOIN `products` AS p ON pi.`productId` = p.`id`
SET
  pi.`quantity` = CASE
    WHEN pi.`purchaseUnit` = 'pcs' THEN pi.`quantity`
    WHEN pi.`purchaseUnit` = 'box' AND p.`pcsPerBox` IS NOT NULL AND p.`pcsPerBox` > 0 THEN pi.`quantity` * p.`pcsPerBox`
    WHEN pi.`purchaseUnit` = 'carton'
      AND p.`boxesPerCarton` IS NOT NULL
      AND p.`pcsPerBox` IS NOT NULL
      AND p.`boxesPerCarton` > 0
      AND p.`pcsPerBox` > 0
      THEN pi.`quantity` * p.`boxesPerCarton` * p.`pcsPerBox`
    ELSE pi.`quantity`
  END,
  pi.`purchaseUnit` = 'pcs'
WHERE pi.`purchaseUnit` IN ('box', 'carton');

ALTER TABLE `products` DROP COLUMN `boxesPerCarton`,
    DROP COLUMN `pcsPerBox`;
