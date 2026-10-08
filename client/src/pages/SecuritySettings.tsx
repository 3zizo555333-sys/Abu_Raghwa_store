import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecurity, PasswordSettings } from '@/contexts/SecurityContext';
import { useLocation } from 'wouter';
import { ArrowLeft, Lock, Unlock, Edit2, Save, X, Eye, EyeOff, Shield, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import ManagerLogin from '@/components/ManagerLogin';

interface SectionConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SECTIONS: SectionConfig[] = [
  { id: 'general', label: 'الأمان العام', description: 'قفل التطبيق بالكامل', icon: <Shield size={20} /> },
  { id: 'products', label: 'إدارة المنتجات', description: 'حماية صفحة إدارة المنتجات', icon: <Lock size={20} /> },
  { id: 'newsale', label: 'تسجيل مبيعة جديدة', description: 'حماية صفحة تسجيل المبيعات', icon: <Lock size={20} /> },
  { id: 'viewreports', label: 'عرض التقارير', description: 'حماية صفحة عرض التقارير', icon: <Lock size={20} /> },
  { id: 'apartment', label: 'إدارة الشقة', description: 'حماية صفحة إدارة الشقة', icon: <Lock size={20} /> },
  { id: 'materials', label: 'قائمة الخامات', description: 'حماية صفحة الخامات', icon: <Lock size={20} /> },
  { id: 'compositions', label: 'قائمة التركيبات', description: 'حماية صفحة التركيبات', icon: <Lock size={20} /> },
  { id: 'employees', label: 'إدارة الموظفين', description: 'حماية صفحة إدارة الموظفين', icon: <Lock size={20} /> },
  { id: 'tasks', label: 'إدارة المهام', description: 'حماية صفحة إدارة المهام', icon: <Lock size={20} /> },
  { id: 'settings', label: 'الإعدادات', description: 'حماية صفحة الإعدادات (دائماً مقفلة)', icon: <Shield size={20} /> },
  { id: 'security', label: 'إدارة الأمان', description: 'حماية صفحة إدارة الأمان', icon: <Shield size={20} /> },
  { id: 'expenses', label: 'إدارة المصاريف', description: 'حماية صفحة إدارة المصاريف', icon: <Lock size={20} /> },
  { id: 'invoices', label: 'تصوير الفواتير', description: 'حماية صفحة تصوير الفواتير', icon: <Lock size={20} /> },
  { id: 'inventory', label: 'إدارة المخزن', description: 'حماية صفحة إدارة المخزن', icon: <Lock size={20} /> },
  { id: 'suppliers', label: 'الموردين والخامات', description: 'حماية صفحة الموردين والخامات', icon: <Lock size={20} /> },
  { id: 'shortages', label: 'النواقص', description: 'حماية صفحة النواقص', icon: <Lock size={20} /> },
  { id: 'sales', label: 'المبيعات', description: 'حماية صفحة المبيعات', icon: <Lock size={20} /> },
  { id: 'points', label: 'نظام النقط', description: 'حماية صفحة نظام النقط', icon: <Lock size={20} /> },
  { id: 'leaderboard', label: 'لوحة الشرف', description: 'حماية صفحة لوحة الشرف', icon: <Lock size={20} /> },
  { id: 'clients', label: 'العملاء', description: 'حماية صفحة العملاء', icon: <Lock size={20} /> },
  { id: 'reports', label: 'التقارير', description: 'حماية صفحة التقارير', icon: <Lock size={20} /> },
  { id: 'logs', label: 'السجل', description: 'حماية صفحة السجل', icon: <Lock size={20} /> },
];

export default function SecuritySettings() {
  const [, navigate] = useLocation();
  const { isManagerLoggedIn, logoutManager, passwordSettings, updatePasswordSettings } = useSecurity();
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState<{ [key: string]: boolean }>({});
  const [isSaving, setIsSaving] = useState(false);

  if (!isManagerLoggedIn) {
    return (
      <ManagerLogin
        title="إدارة الأمان"
        description="تحقق من هويتك كمدير للدخول إلى إعدادات الأمان"
        onSuccess={() => {}}
      />
    );
  }

  const handleToggleProtection = async (sectionId: string) => {
    setIsSaving(true);
    const updated = {
      ...passwordSettings,
      [sectionId]: {
        ...passwordSettings[sectionId],
        enabled: !passwordSettings[sectionId]?.enabled
      }
    };
    updatePasswordSettings(updated);
    
    const action = updated[sectionId].enabled ? 'تفعيل' : 'إلغاء';
    toast.success(`✅ تم ${action} الحماية`);
    setIsSaving(false);
  };

  const handleSavePassword = async (sectionId: string) => {
    if (!newPassword.trim()) {
      toast.error('❌ الرجاء إدخال الباسورد');
      return;
    }

    setIsSaving(true);
    const updated = {
      ...passwordSettings,
      [sectionId]: {
        ...passwordSettings[sectionId],
        password: newPassword,
        enabled: true,
        lastModified: new Date().toISOString()
      }
    };
    updatePasswordSettings(updated);
    
    toast.success('✅ تم حفظ الباسورد بنجاح');
    setEditingSection(null);
    setNewPassword('');
    setIsSaving(false);
  };

  const handleLogout = () => {
    logoutManager();
    navigate('/dashboard');
    toast.success('✅ تم تسجيل الخروج');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">🔐 إدارة الأمان والباسوردات</h1>
            <p className="text-blue-100 mt-1">تحكم كامل في حماية التطبيق</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="text-white border-white hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4 ml-2" />
              تسجيل خروج
            </Button>
            <Button
              onClick={() => navigate('/dashboard')}
              variant="outline"
              className="text-white border-white hover:bg-white/20"
            >
              <ArrowLeft className="w-4 h-4 ml-2" />
              العودة
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Manager Info */}
        <Card className="border-2 border-green-300 shadow-lg mb-8 bg-green-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-green-600" size={24} />
              <div>
                <p className="font-bold text-gray-900">✅ أنت مسجل كمدير</p>
                <p className="text-sm text-gray-600">لديك صلاحيات كاملة لإدارة الأمان</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sections Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SECTIONS.map((section) => {
            const setting = passwordSettings[section.id];
            const isEnabled = setting?.enabled ?? false;
            const isEditing = editingSection === section.id;
            const isSettingsSection = section.id === 'settings';

            return (
              <Card
                key={section.id}
                className={`border-2 shadow-lg transition ${
                  isEnabled
                    ? 'border-red-400 bg-red-50'
                    : 'border-gray-300 bg-white'
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{section.icon}</span>
                      <div>
                        <CardTitle className="text-lg">{section.label}</CardTitle>
                        <CardDescription className="text-xs">{section.description}</CardDescription>
                      </div>
                    </div>
                    {isEnabled ? (
                      <Lock className="text-red-600" size={20} />
                    ) : (
                      <Unlock className="text-gray-400" size={20} />
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">الحالة:</span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        isEnabled
                          ? 'bg-red-200 text-red-800'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      {isEnabled ? '🔒 مقفل' : '🔓 مفتوح'}
                    </span>
                  </div>

                  {/* Password Display */}
                  {isEnabled && !isEditing && (
                    <div className="bg-gray-100 p-3 rounded-lg">
                      <p className="text-xs text-gray-600 mb-1">الباسورد الحالي:</p>
                      <div className="flex items-center gap-2">
                        <input
                          type={showPassword[section.id] ? 'text' : 'password'}
                          value={setting?.password || ''}
                          readOnly
                          className="flex-1 bg-white border-2 border-gray-300 rounded px-2 py-1 text-sm font-mono"
                        />
                        <button
                          onClick={() =>
                            setShowPassword({
                              ...showPassword,
                              [section.id]: !showPassword[section.id]
                            })
                          }
                          className="text-gray-600 hover:text-gray-900"
                        >
                          {showPassword[section.id] ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Edit Mode */}
                  {isEditing && (
                    <div className="space-y-2">
                      <label className="block text-sm font-bold text-gray-700">باسورد جديد</label>
                      <div className="relative">
                        <Input
                          type={showPassword[section.id] ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="أدخل الباسورد الجديد"
                          className="pr-10 border-2 border-blue-300"
                          autoFocus
                        />
                        <button
                          onClick={() =>
                            setShowPassword({
                              ...showPassword,
                              [section.id]: !showPassword[section.id]
                            })
                          }
                          className="absolute left-3 top-3 text-gray-500"
                        >
                          {showPassword[section.id] ? (
                            <EyeOff size={18} />
                          ) : (
                            <Eye size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Last Modified */}
                  {setting?.lastModified && (
                    <p className="text-xs text-gray-500">
                      آخر تحديث: {new Date(setting.lastModified).toLocaleDateString('ar-EG')}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2">
                    {isEditing ? (
                      <>
                        <Button
                          onClick={() => handleSavePassword(section.id)}
                          disabled={isSaving || !newPassword.trim()}
                          className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          <Save size={16} className="ml-1" />
                          حفظ
                        </Button>
                        <Button
                          onClick={() => {
                            setEditingSection(null);
                            setNewPassword('');
                          }}
                          variant="outline"
                          size="sm"
                          className="flex-1"
                        >
                          <X size={16} className="ml-1" />
                          إلغاء
                        </Button>
                      </>
                    ) : (
                      <>
                        {!isSettingsSection && (
                          <Button
                            onClick={() => handleToggleProtection(section.id)}
                            disabled={isSaving}
                            variant={isEnabled ? 'destructive' : 'outline'}
                            size="sm"
                            className="flex-1"
                          >
                            {isEnabled ? (
                              <>
                                <Unlock size={16} className="ml-1" />
                                فتح
                              </>
                            ) : (
                              <>
                                <Lock size={16} className="ml-1" />
                                قفل
                              </>
                            )}
                          </Button>
                        )}
                        {isEnabled && (
                          <Button
                            onClick={() => {
                              setEditingSection(section.id);
                              setNewPassword('');
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <Edit2 size={16} className="ml-1" />
                            تعديل
                          </Button>
                        )}
                      </>
                    )}
                  </div>

                  {isSettingsSection && (
                    <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-2 text-center">
                      <p className="text-xs text-yellow-800 font-semibold">
                        ⚠️ هذا القسم مقفل دائماً
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Info Section */}
        <Card className="border-2 border-blue-300 shadow-lg mt-8 bg-blue-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="text-blue-600" />
              معلومات مهمة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>✅ الباسوردات محفوظة بشكل آمن في جهازك</p>
            <p>✅ يمكنك تفعيل أو إلغاء حماية أي قسم في أي وقت</p>
            <p>✅ تغيير الباسورد يتم حفظه فوراً</p>
            <p>✅ صفحة الإعدادات مقفلة دائماً للمدير فقط</p>
            <p>✅ عند محاولة الدخول لقسم مقفل، سيُطلب إدخال الباسورد</p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
