ALTER TABLE `customer_loyalty`
  ADD INDEX `customer_loyalty_phone_idx` (`phone`);

ALTER TABLE `catalog_orders`
  ADD INDEX `catalog_orders_status_created_idx` (`status`, `createdAt`),
  ADD INDEX `catalog_orders_customer_phone_idx` (`customerPhone`);
