-- Assign pharmacy catalog rows to a branch; default = first branch id (create a branch before applying if empty).

SET @default_branch := (SELECT MIN(id) FROM `branches`);

ALTER TABLE `categories` ADD COLUMN `branchId` INTEGER NULL;
ALTER TABLE `suppliers` ADD COLUMN `branchId` INTEGER NULL;
ALTER TABLE `products` ADD COLUMN `branchId` INTEGER NULL;

UPDATE `categories` SET `branchId` = @default_branch WHERE `branchId` IS NULL;
UPDATE `suppliers` SET `branchId` = @default_branch WHERE `branchId` IS NULL;
UPDATE `products` SET `branchId` = @default_branch WHERE `branchId` IS NULL;

ALTER TABLE `categories` DROP INDEX `categories_name_key`;
ALTER TABLE `products` DROP INDEX `products_code_key`;

ALTER TABLE `categories` MODIFY `branchId` INTEGER NOT NULL;
ALTER TABLE `suppliers` MODIFY `branchId` INTEGER NOT NULL;
ALTER TABLE `products` MODIFY `branchId` INTEGER NOT NULL;

ALTER TABLE `categories` ADD CONSTRAINT `categories_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `suppliers` ADD CONSTRAINT `suppliers_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `products` ADD CONSTRAINT `products_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `branches`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX `categories_branchId_name_key` ON `categories`(`branchId`, `name`);
CREATE UNIQUE INDEX `products_branchId_code_key` ON `products`(`branchId`, `code`);
CREATE INDEX `suppliers_branchId_idx` ON `suppliers`(`branchId`);
