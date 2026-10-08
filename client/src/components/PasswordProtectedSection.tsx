import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useSecurity } from '@/contexts/SecurityContext';
import { Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

interface PasswordProtectedSectionProps {
  section: string;
  sectionLabel: string;
  children: React.ReactNode;
}

export default function PasswordProtectedSection({
  section,
  sectionLabel,
  children
}: PasswordProtectedSectionProps) {
  const { isPasswordEnabled, checkPassword } = useSecurity();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const isProtected = isPasswordEnabled(section);

  if (!isProtected || isUnlocked) {
    return <>{children}</>;
  }

  const handleUnlock = () => {
    setError('');

    if (!password.trim()) {
      setError('الرجاء إدخال الباسورد');
      return;
    }

    if (checkPassword(section, password)) {
      setIsUnlocked(true);
      setPassword('');
      toast.success(`✅ تم فتح ${sectionLabel}`);
    } else {
      setAttempts(attempts + 1);
      setError('❌ الباسورد غير صحيح');
      toast.error('❌ الباسورد غير صحيح');

      if (attempts >= 4) {
        setError('⚠️ تم تجاوز عدد المحاولات - يرجى المحاولة لاحقاً');
        setPassword('');
        setTimeout(() => setAttempts(0), 30000); // إعادة تعيين بعد 30 ثانية
      }
    }
  };

  const isLocked = attempts >= 5;

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-3 border-red-400 shadow-2xl">
        <CardContent className="space-y-6 pt-8">
          {/* Lock Icon */}
          <div className="text-center">
            <div className="inline-block p-4 bg-red-100 rounded-full mb-4">
              <Lock className="text-red-600" size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{sectionLabel} مقفل</h2>
            <p className="text-gray-600 mt-2">أدخل الباسورد للمتابعة</p>
          </div>

          {/* Password Input */}
          <div className="space-y-2">
            <label className="block text-sm font-bold text-gray-700">الباسورد</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                placeholder="أدخل الباسورد"
                className="pr-10 border-2 border-gray-300 focus:border-red-500 text-right"
                disabled={isLocked}
                onKeyPress={(e) => e.key === 'Enter' && !isLocked && handleUnlock()}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-3 text-gray-500 hover:text-gray-700"
                disabled={isLocked}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border-2 border-red-400 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <p className="text-sm text-red-800 font-semibold">{error}</p>
            </div>
          )}

          {/* Attempts Counter */}
          {attempts > 0 && !isLocked && (
            <div className="bg-yellow-100 border-2 border-yellow-400 rounded-lg p-3 text-center">
              <p className="text-sm text-yellow-800 font-semibold">
                ⚠️ محاولات متبقية: {5 - attempts}
              </p>
            </div>
          )}

          {/* Unlock Button */}
          <Button
            onClick={handleUnlock}
            disabled={isLocked || !password.trim()}
            className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white font-bold py-3 text-lg"
          >
            {isLocked ? '⏳ محاولة لاحقاً' : 'فتح الآن'}
          </Button>

          {/* Info */}
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-800 font-semibold">
              🔒 هذا القسم محمي بباسورد
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
