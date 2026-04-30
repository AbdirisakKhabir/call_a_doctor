-- Sub-tests do not carry their own catalog price; billing uses the panel fee only.
UPDATE `lab_tests` SET `price` = 0 WHERE `parentTestId` IS NOT NULL;
