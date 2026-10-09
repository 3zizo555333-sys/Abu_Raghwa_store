CREATE TABLE IF NOT EXISTS `cloud_app_records` (
  `collectionKey` varchar(128) NOT NULL,
  `recordId` varchar(191) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `dataJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`collectionKey`, `recordId`),
  KEY `cloud_app_records_position_idx` (`collectionKey`, `position`)
);

CREATE TABLE IF NOT EXISTS `cloud_app_backups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collectionKey` varchar(128) NOT NULL,
  `dataJson` longtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `cloud_app_backups_collection_idx` (`collectionKey`, `createdAt`)
);

CREATE TABLE IF NOT EXISTS `global_app_settings` (
  `key` varchar(128) NOT NULL,
  `dataJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key`)
);
