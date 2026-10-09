CREATE TABLE `global_app_settings` (
	`key` varchar(128) NOT NULL,
	`dataJson` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `global_app_settings_key` PRIMARY KEY(`key`)
);
