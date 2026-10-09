import React, { useEffect } from 'react';
import { useNotification } from './NotificationSystem';

interface Product {
  id: string;
  name: string;
  quantity: number;
  minQuantity?: number;
}

interface InventoryAlertManagerProps {
  products: Product[];
  minThreshold?: number;
}

export const InventoryAlertManager: React.FC<InventoryAlertManagerProps> = ({
  products,
  minThreshold = 5
}) => {
  const { addNotification } = useNotification();
  const [checkedProducts, setCheckedProducts] = React.useState<Set<string>>(new Set());

  useEffect(() => {
    products.forEach(product => {
      const threshold = product.minQuantity || minThreshold;
      const shouldAlert = product.quantity <= threshold && !checkedProducts.has(product.id);

      if (shouldAlert) {
        if (product.quantity === 0) {
          addNotification(
            'error',
            'المنتج نفد من المخزون',
            `المنتج "${product.name}" نفد من المخزون تماماً`
          );
        } else if (product.quantity <= threshold / 2) {
          addNotification(
            'error',
            'تحذير حرج - نقص المخزون',
            `المنتج "${product.name}" كمية متبقية: ${product.quantity} فقط`
          );
        } else {
          addNotification(
            'warning',
            'تنبيه نقص المخزون',
            `المنتج "${product.name}" كمية متبقية: ${product.quantity}`
          );
        }

        setCheckedProducts(prev => {
          const newSet = new Set(prev);
          newSet.add(product.id);
          return newSet;
        });
      }
    });
  }, [products, minThreshold, addNotification, checkedProducts]);

  return null;
};
