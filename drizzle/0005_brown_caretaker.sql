ALTER TABLE `catalog_orders` ADD `loyaltyPointsAwarded` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `customer_loyalty` ADD `transactionsJson` text;