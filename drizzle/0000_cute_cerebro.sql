CREATE TABLE `customer_loyalty` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phone` varchar(32) NOT NULL,
	`name` text NOT NULL,
	`points` int NOT NULL DEFAULT 0,
	`usedCoupons` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customer_loyalty_id` PRIMARY KEY(`id`),
	CONSTRAINT `customer_loyalty_phone_unique` UNIQUE(`phone`)
);
--> statement-breakpoint
CREATE TABLE `shared_offers` (
	`id` varchar(64) NOT NULL,
	`offerData` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shared_offers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
