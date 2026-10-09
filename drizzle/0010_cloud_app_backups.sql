CREATE TABLE `cloud_app_backups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `collectionKey` varchar(128) NOT NULL,
  `dataJson` longtext NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `cloud_app_backups_collection_created` (`collectionKey`, `createdAt`)
);
