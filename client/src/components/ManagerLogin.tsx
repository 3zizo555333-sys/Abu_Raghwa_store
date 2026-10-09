import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSecurity } from '@/contexts/SecurityContext';
import { Lock, Mail, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ManagerLoginProps {
  onSuccess?: () => void;
  title?: string;
  description?: string;
}

export default function ManagerLogin({ onSuccess, title = 'تحقق من هويتك', description = 'أدخل إيميل المدير للمتابعة' }: ManagerLoginProps) {
  const { loginManager } = useSecurity();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setIsLoading(true);

    if (!email.trim()) {
      setError('الرجاء إدخال الإيميل');
      setIsLoading(false);
      return;
    }

    // محاكاة تأخير طفيف
    await new Promise(resolve => setTimeout(resolve, 500));

    if (loginManager(email)) {
      toast.success('✅ تم التحقق بنجاح - مرحباً بك أيها المدير');
      setEmail('');
      onSuccess?.();
    } else {
      setError('❌ غير مصرح لك بالدخول - الإيميل غير صحيح');
      toast.error('❌ فشل التحقق - الإيميل غير صحيح');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-2 border-red-300 shadow-2xl">
        <CardHeader className="bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-t-lg">
          <div className="flex items-center gap-3 mb-2">
            <Lock size={28} />
            <CardTitle className="text-2xl">{title}</CardTitle>
          </div>
          <CardDescription className="text-red-100">{description}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pt-6">
          {/* Email Input */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700">إيميل المدير</label>
            <div className="relative">
              <Mail className="absolute right-3 top-3 text-gray-400" size={20} />
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="أدخل إيميل المدير"
                className="pr-10 border-2 border-gray-300 focus:border-red-500 text-right"
                disabled={isLoading}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-800 font-semibold">{error}</p>
            </div>
          )}

          {/* Success Hint */}
          {email.trim() && !error && (
            <div className="bg-green-100 border-2 border-green-400 rounded-lg p-3 flex items-start gap-2">
              <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-green-800 font-semibold">سيتم التحقق من حساب المدير المعتمد</p>
            </div>
          )}

          {/* Login Button */}
          <Button
            onClick={handleLogin}
            disabled={isLoading || !email.trim()}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold py-3 text-lg"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⏳</span>
                جاري التحقق...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Lock size={20} />
                تحقق الآن
              </span>
            )}
          </Button>

          {/* Info */}
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-800 font-semibold">
              💡 هذه الصفحة مخصصة للمدير فقط
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
