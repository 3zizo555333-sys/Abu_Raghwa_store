ALTER TABLE `catalog_orders` ADD `archivedAt` timestamp;
--> statement-breakpoint
ALTER TABLE `catalog_orders` ADD `archivedPointsReversed` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `offer_purchase_requests_status_created_idx` ON `offer_purchase_requests` (`status`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `offer_purchase_requests_customer_code_idx` ON `offer_purchase_requests` (`customerCode`);
