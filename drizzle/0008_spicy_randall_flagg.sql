CREATE TABLE `cloud_app_backups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`collectionKey` varchar(128) NOT NULL,
	`dataJson` longtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cloud_app_backups_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cloud_app_records` (
	`collectionKey` varchar(128) NOT NULL,
	`recordId` varchar(191) NOT NULL,
	`position` int NOT NULL DEFAULT 0,
	`dataJson` longtext NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cloud_app_records_collectionKey_recordId_pk` PRIMARY KEY(`collectionKey`,`recordId`)
);
--> statement-breakpoint
ALTER TABLE `global_app_settings` MODIFY COLUMN `dataJson` longtext NOT NULL;--> statement-breakpoint
CREATE INDEX `catalog_orders_status_created_idx` ON `catalog_orders` (`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `catalog_orders_customer_phone_idx` ON `catalog_orders` (`customerPhone`);--> statement-breakpoint
CREATE INDEX `customer_loyalty_phone_idx` ON `customer_loyalty` (`phone`);