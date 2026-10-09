ALTER TABLE `customer_loyalty` DROP INDEX `customer_loyalty_phone_unique`;
ALTER TABLE `customer_loyalty` MODIFY COLUMN `phone` varchar(32) NULL;
ALTER TABLE `customer_loyalty` ADD `customerCode` varchar(48) NULL;
UPDATE `customer_loyalty` SET `customerCode` = CONCAT('AR-', LPAD(CAST(`id` AS CHAR), 10, '0')) WHERE `customerCode` IS NULL OR `customerCode` = '';
ALTER TABLE `customer_loyalty` MODIFY COLUMN `customerCode` varchar(48) NOT NULL;
ALTER TABLE `customer_loyalty` ADD CONSTRAINT `customer_loyalty_customerCode_unique` UNIQUE(`customerCode`);
