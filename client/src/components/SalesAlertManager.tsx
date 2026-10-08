import React, { useEffect, useState } from 'react';
import { useNotification } from './NotificationSystem';

interface SaleItem {
  productId: string;
  productName: string;
  selectedUnitType: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Sale {
  id: string;
  date: string;
  items: SaleItem[];
  total: number;
  paymentMethod: string;
  customerName: string;
  customerPhone: string;
}

interface SalesAlertManagerProps {
  sale?: Sale;
  largeOrderThreshold?: number;
  onSaleAlert?: (sale: Sale, alertType: string) => void;
}

export const SalesAlertManager: React.FC<SalesAlertManagerProps> = ({
  sale,
  largeOrderThreshold = 1000,
  onSaleAlert
}) => {
  const { addNotification } = useNotification();
  const [processedSales, setProcessedSales] = useState<Set<string>>(new Set());

  useEffect(() => {
    // تحميل المبيعات المعالجة من localStorage
    const saved = localStorage.getItem('abu_raghwa_processed_sales');
    if (saved) {
      try {
        setProcessedSales(new Set(JSON.parse(saved)));
      } catch (e) {
        console.error('Error loading processed sales:', e);
      }
    }
  }, []);

  useEffect(() => {
    if (!sale || processedSales.has(sale.id)) {
      return;
    }

    let alertType = 'info';
    let title = 'مبيعة جديدة';
    let message = `تم تسجيل مبيعة جديدة - رقم الفاتورة: ${sale.id}`;

    // تنبيه المبيعات الكبيرة
    if (sale.total >= largeOrderThreshold) {
      alertType = 'success';
      title = 'مبيعة كبيرة!';
      message = `مبيعة كبيرة بقيمة ${sale.total.toFixed(2)} ج.م - رقم الفاتورة: ${sale.id}`;
    }

    // تنبيه المبيعات بدون عميل
    if (!sale.customerName || sale.customerName.trim() === '') {
      title = 'مبيعة بدون بيانات عميل';
      message = `تم تسجيل مبيعة بقيمة ${sale.total.toFixed(2)} ج.م بدون بيانات عميل`;
    }

    // تنبيه المبيعات بطريقة دفع غير نقدية
    if (sale.paymentMethod !== 'cash') {
      const paymentMethods: { [key: string]: string } = {
        card: 'بطاقة',
        check: 'شيك',
        transfer: 'تحويل بنكي'
      };
      const methodName = paymentMethods[sale.paymentMethod] || sale.paymentMethod;
      message += ` - طريقة الدفع: ${methodName}`;
    }

    // إضافة الإشعار
    const notificationType = alertType === 'success' ? 'success' : 'info';
    addNotification(notificationType, title, message);

    // تسجيل المبيعة كمعالجة
    setProcessedSales(prev => {
      const updated = new Set(prev);
      updated.add(sale.id);
      localStorage.setItem('abu_raghwa_processed_sales', JSON.stringify(Array.from(updated)));
      return updated;
    });

    if (onSaleAlert) {
      onSaleAlert(sale, alertType);
    }
  }, [sale, largeOrderThreshold, addNotification, processedSales, onSaleAlert]);

  return null;
};
