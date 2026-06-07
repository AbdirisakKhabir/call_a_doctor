-- DropIndex
DROP INDEX `courses_code_key` ON `courses`;

-- DropIndex
DROP INDEX `courses_name_key` ON `courses`;

-- CreateIndex
CREATE UNIQUE INDEX `courses_code_departmentId_key` ON `courses`(`code`, `departmentId`);

-- CreateIndex
CREATE UNIQUE INDEX `courses_name_departmentId_key` ON `courses`(`name`, `departmentId`);
