import React, { useState, useMemo } from 'react';
import { useNotification } from '@/components/NotificationSystem';
import { Button } from '@/components/ui/button';
import { Trash2, CheckCheck, Bell, AlertCircle, Filter, Download } from 'lucide-react';
import { useLocation } from 'wouter';

export default function AdvancedNotificationsPage() {
  const { notifications, removeNotification, markAsRead, clearAll } = useNotification();
  const [, navigate] = useLocation();
  const [filterType, setFilterType] = useState<'all' | 'success' | 'error' | 'warning' | 'info'>('all');
  const [filterRead, setFilterRead] = useState<'all' | 'read' | 'unread'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');

  // تطبيق الفلاتر والترتيب
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    // فلتر النوع
    if (filterType !== 'all') {
      filtered = filtered.filter(n => n.type === filterType);
    }

    // فلتر الحالة
    if (filterRead === 'read') {
      filtered = filtered.filter(n => n.read);
    } else if (filterRead === 'unread') {
      filtered = filtered.filter(n => !n.read);
    }

    // الترتيب
    if (sortBy === 'oldest') {
      return filtered.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    }
    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [notifications, filterType, filterRead, sortBy]);

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-l-4 border-green-500';
      case 'error':
        return 'bg-red-50 border-l-4 border-red-500';
      case 'warning':
        return 'bg-yellow-50 border-l-4 border-yellow-500';
      case 'info':
        return 'bg-blue-50 border-l-4 border-blue-500';
      default:
        return 'bg-gray-50 border-l-4 border-gray-500';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Bell className="w-5 h-5 text-blue-600" />;
    }
  };

  const exportNotifications = () => {
    const csv = [
      ['التاريخ', 'الوقت', 'النوع', 'العنوان', 'الرسالة', 'الحالة'],
      ...filteredNotifications.map(n => [
        n.timestamp.toLocaleDateString('ar-EG'),
        n.timestamp.toLocaleTimeString('ar-EG'),
        n.type,
        n.title,
        n.message,
        n.read ? 'مقروء' : 'غير مقروء'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `إشعارات-${new Date().toLocaleDateString('ar-EG')}.csv`);
    link.click();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">مركز الإشعارات</h1>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
          >
            العودة للرئيسية
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Filter and Action Bar */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">نوع الإشعار</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">الكل</option>
                <option value="success">نجاح</option>
                <option value="error">خطأ</option>
                <option value="warning">تحذير</option>
                <option value="info">معلومة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الحالة</label>
              <select
                value={filterRead}
                onChange={(e) => setFilterRead(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">الكل</option>
                <option value="unread">غير مقروء</option>
                <option value="read">مقروء</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">الترتيب</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="newest">الأحدث أولاً</option>
                <option value="oldest">الأقدم أولاً</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={exportNotifications}
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                disabled={filteredNotifications.length === 0}
              >
                <Download className="w-4 h-4" />
                تصدير CSV
              </Button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={clearAll}
              variant="outline"
              className="flex items-center gap-2"
              disabled={notifications.length === 0}
            >
              <Trash2 className="w-4 h-4" />
              حذف الكل
            </Button>
            <Button
              onClick={() => {
                notifications.forEach(n => markAsRead(n.id));
              }}
              className="flex items-center gap-2"
              disabled={notifications.length === 0}
            >
              <CheckCheck className="w-4 h-4" />
              تحديد الكل كمقروء
            </Button>
          </div>
        </div>

        {/* Notifications List */}
        {filteredNotifications.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm">
            <Bell className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredNotifications.map(notification => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg flex items-start gap-4 ${getNotificationColor(notification.type)} ${
                  !notification.read ? 'ring-2 ring-blue-400' : 'opacity-75'
                }`}
              >
                <div className="flex-shrink-0 mt-1">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-bold text-gray-900">{notification.title}</h3>
                      <p className="text-gray-700 mt-1">{notification.message}</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {notification.timestamp.toLocaleDateString('ar-EG')} - {notification.timestamp.toLocaleTimeString('ar-EG')}
                      </p>
                    </div>
                    {!notification.read && (
                      <span className="ml-2 px-2 py-1 bg-blue-500 text-white text-xs rounded-full">
                        جديد
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {!notification.read && (
                    <Button
                      onClick={() => markAsRead(notification.id)}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                    >
                      مقروء
                    </Button>
                  )}
                  <Button
                    onClick={() => removeNotification(notification.id)}
                    variant="outline"
                    size="sm"
                    className="text-xs"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Statistics */}
        {notifications.length > 0 && (
          <div className="mt-8 grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-600 text-sm">إجمالي الإشعارات</p>
              <p className="text-3xl font-bold text-gray-900">{notifications.length}</p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-600 text-sm">غير مقروءة</p>
              <p className="text-3xl font-bold text-blue-600">
                {notifications.filter(n => !n.read).length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-600 text-sm">تنبيهات حرجة</p>
              <p className="text-3xl font-bold text-red-600">
                {notifications.filter(n => n.type === 'error').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-600 text-sm">تحذيرات</p>
              <p className="text-3xl font-bold text-yellow-600">
                {notifications.filter(n => n.type === 'warning').length}
              </p>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <p className="text-gray-600 text-sm">نجاحات</p>
              <p className="text-3xl font-bold text-green-600">
                {notifications.filter(n => n.type === 'success').length}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
