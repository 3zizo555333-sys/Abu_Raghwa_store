CREATE TABLE `staff_accounts` (
	`id` varchar(96) NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`role` enum('manager','admin','seller') NOT NULL DEFAULT 'seller',
	`status` enum('PENDING_APPROVAL','APPROVED') NOT NULL DEFAULT 'PENDING_APPROVAL',
	`isBlocked` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastLoginAt` timestamp,
	CONSTRAINT `staff_accounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `staff_accounts_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE INDEX `staff_accounts_email_idx` ON `staff_accounts` (`email`);--> statement-breakpoint
CREATE INDEX `staff_accounts_status_idx` ON `staff_accounts` (`status`);