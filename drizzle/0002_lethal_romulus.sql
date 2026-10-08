CREATE TABLE `catalog_orders` (
	`id` varchar(64) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerPhone` varchar(32) NOT NULL,
	`address` text,
	`note` text,
	`itemsJson` text NOT NULL,
	`totalAmount` double NOT NULL,
	`status` enum('new','contacted','confirmed','cancelled') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `catalog_orders_id` PRIMARY KEY(`id`)
);
