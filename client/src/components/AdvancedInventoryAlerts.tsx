import React, { useEffect, useState } from 'react';
import { useNotification } from './NotificationSystem';

interface Product {
  id: string;
  name: string;
  quantity: number;
  minQuantity?: number;
  code?: string;
  unit?: string;
}

interface AlertHistory {
  productId: string;
  alertType: 'critical' | 'warning' | 'info';
  timestamp: Date;
  quantity: number;
}

interface AdvancedInventoryAlertsProps {
  products: Product[];
  minThreshold?: number;
  criticalThreshold?: number;
  onAlertTriggered?: (alert: AlertHistory) => void;
}

export const AdvancedInventoryAlerts: React.FC<AdvancedInventoryAlertsProps> = ({
  products,
  minThreshold = 5,
  criticalThreshold = 2,
  onAlertTriggered
}) => {
  const { addNotification } = useNotification();
  const [lastAlertedProducts, setLastAlertedProducts] = useState<Map<string, Date>>(new Map());

  useEffect(() => {
    products.forEach(product => {
      const threshold = product.minQuantity || minThreshold;
      const lastAlertTime = lastAlertedProducts.get(product.id);
      const now = new Date();

      // تجنب التنبيهات المتكررة في نفس الساعة
      if (lastAlertTime && (now.getTime() - lastAlertTime.getTime()) < 3600000) {
        return;
      }

      let alertType: 'critical' | 'warning' | 'info' | null = null;
      let message = '';

      if (product.quantity <= criticalThreshold) {
        alertType = 'critical';
        message = `تحذير حرج! المنتج "${product.name}" (${product.code || 'بدون كود'}) كمية متبقية: ${product.quantity} فقط`;
      } else if (product.quantity <= threshold / 2) {
        alertType = 'warning';
        message = `تنبيه مهم! المنتج "${product.name}" (${product.code || 'بدون كود'}) كمية متبقية: ${product.quantity}`;
      } else if (product.quantity <= threshold) {
        alertType = 'info';
        message = `تنبيه نقص المخزون: المنتج "${product.name}" (${product.code || 'بدون كود'}) كمية متبقية: ${product.quantity}`;
      }

      if (alertType) {
        const notificationType = alertType === 'critical' ? 'error' : alertType === 'warning' ? 'warning' : 'info';
        const title = alertType === 'critical' ? 'تحذير حرج' : alertType === 'warning' ? 'تنبيه مهم' : 'تنبيه نقص المخزون';

        addNotification(notificationType, title, message);

        // تسجيل التنبيه في السجل
        const newAlert: AlertHistory = {
          productId: product.id,
          alertType,
          timestamp: now,
          quantity: product.quantity
        };

        // تحديث وقت آخر تنبيه
        setLastAlertedProducts(prev => {
          const updated = new Map(prev);
          updated.set(product.id, now);
          return updated;
        });

        if (onAlertTriggered) {
          onAlertTriggered(newAlert);
        }
      }
    });
  }, [products, minThreshold, criticalThreshold, addNotification, lastAlertedProducts, onAlertTriggered]);

  return null;
};
