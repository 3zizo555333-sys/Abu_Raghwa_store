CREATE TABLE `cloud_app_records` (
  `collectionKey` varchar(128) NOT NULL,
  `recordId` varchar(191) NOT NULL,
  `position` int NOT NULL DEFAULT 0,
  `dataJson` longtext NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`collectionKey`, `recordId`)
);
