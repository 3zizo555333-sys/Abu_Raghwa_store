import React from 'react';
import { useNotification } from '@/components/NotificationSystem';
import { Button } from '@/components/ui/button';
import { Trash2, CheckCheck, Bell, AlertCircle } from 'lucide-react';
import { useLocation } from 'wouter';

export default function NotificationsPage() {
  const { notifications, removeNotification, markAsRead, clearAll } = useNotification();
  const [, navigate] = useLocation();

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">الإشعارات</h1>
          <Button
            variant="outline"
            onClick={() => navigate('/')}
          >
            العودة للرئيسية
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Action Buttons */}
        <div className="mb-6 flex gap-3">
          <Button
            onClick={() => navigate("/notifications-advanced")}
            className="flex items-center gap-2"
          >
            عرض متقدم
          </Button>
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

        {/* Notifications List */}
        {notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">لا توجد إشعارات</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(notification => (
              <div
                key={notification.id}
                className={`p-4 rounded-lg flex items-start gap-4 ${getNotificationColor(notification.type)} ${
                  !notification.read ? 'opacity-100' : 'opacity-75'
                }`}
              >
                <div className="flex-shrink-0 mt-1">
                  {getNotificationIcon(notification.type)}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">{notification.title}</h3>
                  <p className="text-gray-700 mt-1">{notification.message}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {notification.timestamp.toLocaleTimeString('ar-EG')}
                  </p>
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
          <div className="mt-8 grid grid-cols-3 gap-4">
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
          </div>
        )}
      </main>
    </div>
  );
}
