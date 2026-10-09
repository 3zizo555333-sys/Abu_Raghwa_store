CREATE TABLE IF NOT EXISTS `shared_offers` (
  `id` varchar(64) NOT NULL,
  `offerData` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customer_loyalty` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerCode` varchar(48) NOT NULL,
  `phone` varchar(32),
  `name` text NOT NULL,
  `points` int NOT NULL DEFAULT 0,
  `usedCoupons` text NOT NULL,
  `transactionsJson` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `customer_loyalty_customer_code_unique` (`customerCode`),
  KEY `customer_loyalty_phone_idx` (`phone`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `global_app_settings` (
  `key` varchar(128) NOT NULL,
  `dataJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cloud_app_records` (
  `collectionKey` varchar(128) NOT NULL,
  `recordId` varchar(191) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `dataJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`collectionKey`, `recordId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `cloud_app_backups` (
  `id` int AUTO_INCREMENT NOT NULL,
  `collectionKey` varchar(128) NOT NULL,
  `dataJson` longtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `catalog_orders` (
  `id` varchar(64) NOT NULL,
  `customerName` varchar(255) NOT NULL,
  `customerPhone` varchar(32) NOT NULL,
  `customerCode` varchar(48),
  `address` text,
  `note` text,
  `itemsJson` text NOT NULL,
  `totalAmount` double NOT NULL,
  `fulfillmentMethod` enum('pickup','delivery') NOT NULL DEFAULT 'pickup',
  `priceAdjustmentPercent` double NOT NULL DEFAULT 0,
  `status` enum('new','contacted','confirmed','preparing','delivered','cancelled') NOT NULL DEFAULT 'new',
  `loyaltyPointsAwarded` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `catalog_orders_status_created_idx` (`status`, `createdAt`),
  KEY `catalog_orders_customer_phone_idx` (`customerPhone`)
);
